import dagre from '@dagrejs/dagre';
import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from '@xyflow/react';
import { inferWorkflowConnections, projectWorkflowToVisualGraph, type Project, type WorkflowConnection, type WorkflowNode } from '@awm/shared';
import { create } from 'zustand';

export interface EditorNodeData extends Record<string, unknown> {
  domainNodeId: string;
  node: WorkflowNode;
  productStatus?: 'Supported' | 'Needs Clarification' | 'Platform Limitation' | 'Unresolved';
  platformBadges?: string[];
}
export type EditorNode = Node<EditorNodeData, 'workflow'>;
export type EditorEdge = Edge<{ domainConnectionId: string }>;
interface Snapshot { nodes: EditorNode[]; edges: EditorEdge[]; workflow: Project['workflow'] }

interface EditorState extends Snapshot {
  selectedNodeId: string | null; past: Snapshot[]; future: Snapshot[];
  initialize(project: Project): void;
  onNodesChange(changes: NodeChange<EditorNode>[]): void;
  onEdgesChange(changes: EdgeChange<Edge>[]): void;
  connect(connection: Connection): void;
  selectNode(id: string | null): void;
  updateSelected(patch: Partial<WorkflowNode>): void;
  addNode(category: WorkflowNode['category']): void;
  duplicateSelected(): void;
  applyProposedWorkflow(workflow: Project['workflow']): void;
  autoLayout(direction?: 'LR' | 'TB', domainNodeIds?: ReadonlySet<string>): void;
  undo(): void; redo(): void;
}

const snapshot = (state: Snapshot): Snapshot => structuredClone({ nodes: state.nodes, edges: state.edges, workflow: state.workflow });
const nodeData = (node: WorkflowNode): EditorNodeData => ({ domainNodeId: node.id, node });
const semanticLabel = (connection: WorkflowConnection) => {
  const value = connection.branchLabel || connection.label;
  if (value === 'LOOP') return 'Loop Back';
  if (value === 'DONE') return 'Completed';
  if (value === 'DEFAULT') return 'Unknown Route';
  if (value === 'FAILED' && connection.style === 'loop') return 'Retry';
  return value || undefined;
};
const edgePresentation = (connection: WorkflowConnection) => ({
  label: semanticLabel(connection),
  sourceHandle: ['TRUE', 'FOUND', 'APPROVED', 'PAID', 'QUALIFIED'].includes(connection.branchLabel ?? '') ? 'positive' : ['FALSE', 'NOT FOUND', 'REJECTED', 'UNPAID', 'NOT QUALIFIED'].includes(connection.branchLabel ?? '') ? 'negative' : 'default',
  style: { stroke: connection.style === 'failure' ? '#c65b62' : connection.style === 'conditional' ? '#c79227' : connection.style === 'loop' ? '#7659b6' : '#4f8a6c', strokeWidth: 2 },
  labelStyle: { fill: '#435149', fontSize: 10, fontWeight: 700 },
  labelBgStyle: { fill: '#ffffff', fillOpacity: .92 },
});
const record = (state: EditorState): Pick<EditorState, 'past' | 'future'> => ({ past: [...state.past.slice(-49), snapshot(state)], future: [] });

export const useEditorStore = create<EditorState>((set, get) => ({
  nodes: [], edges: [], workflow: null as unknown as Project['workflow'], selectedNodeId: null, past: [], future: [],
  initialize(project) {
    const workflow = inferWorkflowConnections(structuredClone(project.workflow));
    const projected = projectWorkflowToVisualGraph(workflow);
    const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
    const savedPositions = new Map(project.visualGraph.nodes.map((node) => [node.data.domainNodeId, node.position]));
    const connectionsById = new Map(workflow.connections.map((connection) => [connection.id, connection]));
    const nodes = projected.nodes.flatMap((visual) => {
      const domain = byId.get(visual.data.domainNodeId);
      return domain ? [{ ...visual, type: 'workflow' as const, position: savedPositions.get(domain.id) ?? visual.position, data: nodeData(domain) }] : [];
    });
    const edges = projected.edges.flatMap((edge) => {
      const domain = connectionsById.get(edge.data.domainConnectionId);
      return domain ? [{ ...edge, type: 'smoothstep' as const, data: edge.data, ...edgePresentation(domain) }] : [];
    });
    set({ workflow, nodes, edges, selectedNodeId: null, past: [], future: [] });
  },
  onNodesChange(changes) {
    set((state) => {
      const history = changes.some((change) => change.type === 'remove' || (change.type === 'position' && change.dragging === false)) ? record(state) : { past: state.past, future: state.future };
      const removedVisualIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
      const removedDomainIds = new Set(state.nodes.filter((node) => removedVisualIds.has(node.id)).map((node) => node.data.domainNodeId));
      return { ...history, nodes: applyNodeChanges(changes, state.nodes), workflow: removedDomainIds.size ? { ...state.workflow, nodes: state.workflow.nodes.filter((node) => !removedDomainIds.has(node.id)), connections: state.workflow.connections.filter((edge) => !removedDomainIds.has(edge.sourceNodeId) && !removedDomainIds.has(edge.targetNodeId)) } : state.workflow, edges: removedDomainIds.size ? state.edges.filter((edge) => !removedVisualIds.has(edge.source) && !removedVisualIds.has(edge.target)) : state.edges, selectedNodeId: removedVisualIds.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId };
    });
  },
  onEdgesChange(changes) { set((state) => { const removed = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id)); return { ...(removed.size ? record(state) : {}), edges: applyEdgeChanges(changes as EdgeChange<EditorEdge>[], state.edges), workflow: removed.size ? { ...state.workflow, connections: state.workflow.connections.filter((edge) => !removed.has(`visual-${edge.id}`)) } : state.workflow }; }); },
  connect(connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    set((state) => {
      const source = state.nodes.find((node) => node.id === connection.source)?.data.domainNodeId; const target = state.nodes.find((node) => node.id === connection.target)?.data.domainNodeId;
      if (!source || !target || state.workflow.connections.some((edge) => edge.sourceNodeId === source && edge.targetNodeId === target)) return state;
      const id = crypto.randomUUID(); const domainConnection = { id, sourceNodeId: source, targetNodeId: target, sourcePort: 'output', targetPort: 'input', label: 'SUCCESS', branchLabel: 'SUCCESS' as const, style: 'success' as const, condition: null, routeType: 'success' as const, mappings: [] };
      return { ...record(state), edges: addEdge({ ...connection, id: `visual-${id}`, type: 'smoothstep', data: { domainConnectionId: id } }, state.edges), workflow: { ...state.workflow, connections: [...state.workflow.connections, domainConnection] } };
    });
  },
  selectNode(id) { set({ selectedNodeId: id }); },
  updateSelected(patch) { set((state) => { const visual = state.nodes.find((node) => node.id === state.selectedNodeId); if (!visual) return state; const nextWorkflow = { ...state.workflow, nodes: state.workflow.nodes.map((node) => node.id === visual.data.domainNodeId ? { ...node, ...patch } : node) }; const domain = nextWorkflow.nodes.find((node) => node.id === visual.data.domainNodeId)!; return { ...record(state), workflow: nextWorkflow, nodes: state.nodes.map((node) => node.id === visual.id ? { ...node, data: nodeData(domain) } : node) }; }); },
  addNode(category) { set((state) => { const id = crypto.randomUUID(); const domain: WorkflowNode = { id, category, name: `New ${category.replace('_', ' ')}`, description: '', service: null, operation: null, purpose: '', expectedResult: '', icon: `generic-${category}`, estimatedExecution: 'Under 1 minute', inputs: [], outputs: [], credentials: [], configuration: {}, status: 'unconfigured', configurationCompleteness: 0, conditions: [], decisionRule: null, notes: '', bestPractices: [], potentialErrors: [], alternativeImplementations: [], performanceNotes: [], securityNotes: [], riskLevel: 'low' }; const visual: EditorNode = { id: `visual-${id}`, type: 'workflow', position: { x: 80 + state.nodes.length * 28, y: 90 + state.nodes.length * 24 }, data: nodeData(domain) }; return { ...record(state), workflow: { ...state.workflow, nodes: [...state.workflow.nodes, domain] }, nodes: [...state.nodes, visual], selectedNodeId: visual.id }; }); },
  duplicateSelected() { const state = get(); const visual = state.nodes.find((node) => node.id === state.selectedNodeId); const domain = state.workflow.nodes.find((node) => node.id === visual?.data.domainNodeId); if (!visual || !domain) return; const id = crypto.randomUUID(); const copy = { ...structuredClone(domain), id, name: `${domain.name} copy` }; set({ ...record(state), workflow: { ...state.workflow, nodes: [...state.workflow.nodes, copy] }, nodes: [...state.nodes, { ...visual, id: `visual-${id}`, position: { x: visual.position.x + 40, y: visual.position.y + 40 }, selected: false, data: nodeData(copy) }], selectedNodeId: `visual-${id}` }); },
  applyProposedWorkflow(workflow) { set((state) => { const existing = new Map(state.nodes.map((item) => [item.data.domainNodeId, item])); const nodes = workflow.nodes.map((domain, index) => { const current = existing.get(domain.id); return current ? { ...current, data: nodeData(domain), selected: false } : { id: `visual-${domain.id}`, type: 'workflow' as const, position: { x: 100 + (index % 4) * 350, y: 100 + Math.floor(index / 4) * 230 }, data: nodeData(domain) }; }); const edges = workflow.connections.map((edge) => ({ id: `visual-${edge.id}`, source: `visual-${edge.sourceNodeId}`, target: `visual-${edge.targetNodeId}`, type: 'smoothstep', data: { domainConnectionId: edge.id }, ...edgePresentation(edge) })); return { ...record(state), workflow: structuredClone(workflow), nodes, edges, selectedNodeId: null }; }); },
  autoLayout(direction = 'LR', domainNodeIds) { set((state) => {
    const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: direction, ranksep: 110, nodesep: 80, edgesep: 35 });
    const includedVisualIds = new Set(state.nodes
      .filter((node) => !domainNodeIds || domainNodeIds.has(node.data.domainNodeId))
      .map((node) => node.id));
    state.nodes.filter((node) => includedVisualIds.has(node.id)).forEach((node) => graph.setNode(node.id, { width: 290, height: 184 }));
    state.edges.filter((edge) => includedVisualIds.has(edge.source) && includedVisualIds.has(edge.target)).forEach((edge) => graph.setEdge(edge.source, edge.target));
    dagre.layout(graph);
    return {
      ...record(state),
      nodes: state.nodes.map((node) => {
        if (!includedVisualIds.has(node.id)) return node;
        const point = graph.node(node.id) as { x: number; y: number };
        return { ...node, position: { x: point.x - 145, y: point.y - 92 } };
      }),
    };
  }); },
  undo() { set((state) => { const previous = state.past.at(-1); if (!previous) return state; return { ...previous, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future], selectedNodeId: null }; }); },
  redo() { set((state) => { const next = state.future[0]; if (!next) return state; return { ...next, past: [...state.past, snapshot(state)], future: state.future.slice(1), selectedNodeId: null }; }); }
}));
