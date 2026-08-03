import dagre from '@dagrejs/dagre';
import { addEdge, applyEdgeChanges, applyNodeChanges, MarkerType, reconnectEdge, type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type XYPosition } from '@xyflow/react';
import { aiAttachmentPortFor, aiAttachmentPositions, isAiAttachmentConnection, isAiAttachmentNode, isN8nAiAgent, inferWorkflowConnections, projectWorkflowToVisualGraph, type AiAgentAttachmentSummary, type AiAttachmentType, type Platform, type Project, type WorkflowConnection, type WorkflowNode } from '@awm/shared';
import { create } from 'zustand';
import type { ManualLibraryItem } from './manual-platform-library';
import { branchControlFor, createEditorBranch, MAX_DYNAMIC_BRANCHES, readEditorBranches, writeEditorBranches } from './editor-branches';
import type { AiAttachmentOption } from './ai-attachment-options';

export interface EditorNodeData extends Record<string, unknown> {
  domainNodeId: string;
  node: WorkflowNode;
  platform: Platform;
  routeHandles?: Array<{ id: string; label: string }>;
  productStatus?: 'Supported' | 'Needs Clarification' | 'Platform Limitation' | 'Unresolved';
  platformBadges?: string[];
  attachmentSummary?: AiAgentAttachmentSummary;
  onAddAttachment?: (agentId: string, type: AiAttachmentType) => void;
}
export type EditorNode = Node<EditorNodeData, 'workflow'>;
export type EditorEdge = Edge<{ domainConnectionId: string }>;
interface Snapshot { nodes: EditorNode[]; edges: EditorEdge[]; workflow: Project['workflow'] }

interface EditorState extends Snapshot {
  selectedNodeId: string | null; selectedEdgeId: string | null; past: Snapshot[]; future: Snapshot[];
  initialize(project: Project): void;
  onNodesChange(changes: NodeChange<EditorNode>[]): void;
  onEdgesChange(changes: EdgeChange<Edge>[]): void;
  connect(connection: Connection): void;
  reconnect(edge: EditorEdge, connection: Connection): void;
  selectNode(id: string | null): void;
  selectEdge(id: string | null): void;
  updateSelected(patch: Partial<WorkflowNode>): void;
  addSelectedBranch(): void;
  renameSelectedBranch(branchId: string, label: string): void;
  moveSelectedBranch(branchId: string, direction: -1 | 1): void;
  removeSelectedBranch(branchId: string): void;
  addNode(item: ManualLibraryItem | WorkflowNode['category'], position?: XYPosition, platform?: Platform): string;
  addAiAttachment(agentId: string, option: AiAttachmentOption): string | null;
  deleteNode(id?: string | null): void;
  deleteEdge(id?: string | null): void;
  duplicateSelected(): void;
  applyProposedWorkflow(workflow: Project['workflow']): void;
  autoLayout(direction?: 'LR' | 'TB', domainNodeIds?: ReadonlySet<string>): void;
  undo(): void; redo(): void;
}

const snapshot = (state: Snapshot): Snapshot => structuredClone({ nodes: state.nodes, edges: state.edges, workflow: state.workflow });
const nodeData = (node: WorkflowNode, platform: Platform): EditorNodeData => ({ domainNodeId: node.id, node, platform });
const semanticLabel = (connection: WorkflowConnection) => {
  if (connection.sourcePort === 'item') return 'Each Item';
  if (connection.sourcePort === 'done') return 'Completed';
  if (connection.targetPort === 'loop-back') return 'Loop Back';
  const value = connection.branchLabel || connection.label;
  if (value === 'LOOP') return 'Loop Back';
  if (value === 'DONE') return 'Completed';
  if (value === 'DEFAULT') return 'Unknown Route';
  if (value === 'FAILED' && connection.style === 'loop') return 'Retry';
  return value || undefined;
};
const edgePresentation = (connection: WorkflowConnection) => ({
  label: semanticLabel(connection) ?? '',
  sourceHandle: connection.sourcePort && connection.sourcePort !== 'output' ? connection.sourcePort : ['TRUE', 'FOUND', 'APPROVED', 'PAID', 'QUALIFIED'].includes(connection.branchLabel ?? '') ? 'positive' : ['FALSE', 'NOT FOUND', 'REJECTED', 'UNPAID', 'NOT QUALIFIED'].includes(connection.branchLabel ?? '') ? 'negative' : 'default',
  targetHandle: connection.targetPort && connection.targetPort !== 'input' ? connection.targetPort : null,
  style: isAiAttachmentConnection(connection) ? { stroke: '#6f8f7d', strokeWidth: 1.4, strokeDasharray: '5 5' } : { stroke: connection.style === 'failure' ? '#c65b62' : connection.style === 'conditional' ? '#c79227' : connection.style === 'loop' ? '#7659b6' : '#4f8a6c', strokeWidth: 2 },
  labelStyle: { fill: '#435149', fontSize: 10, fontWeight: 700 },
  labelBgStyle: { fill: '#ffffff', fillOpacity: .92 },
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
});
const connectionSemantics = (sourceHandle: string | null | undefined, dynamicLabel?: string): Pick<WorkflowConnection, 'sourcePort' | 'label' | 'branchLabel' | 'style' | 'condition' | 'routeType'> => {
  if (sourceHandle === 'positive') return { sourcePort: 'positive', label: 'TRUE', branchLabel: 'TRUE', style: 'conditional', condition: null, routeType: 'conditional' };
  if (sourceHandle === 'negative') return { sourcePort: 'negative', label: 'FALSE', branchLabel: 'FALSE', style: 'failure', condition: null, routeType: 'conditional' };
  if (sourceHandle === 'approved') return { sourcePort: 'approved', label: 'APPROVED', branchLabel: 'APPROVED', style: 'success', condition: null, routeType: 'conditional' };
  if (sourceHandle === 'rejected') return { sourcePort: 'rejected', label: 'REJECTED', branchLabel: 'REJECTED', style: 'failure', condition: null, routeType: 'conditional' };
  if (sourceHandle === 'item') return { sourcePort: 'item', label: 'Current Item', branchLabel: 'LOOP', style: 'loop', condition: null, routeType: 'conditional' };
  if (sourceHandle === 'done') return { sourcePort: 'done', label: 'Completed', branchLabel: 'DONE', style: 'success', condition: null, routeType: 'success' };
  if (sourceHandle === 'exhausted') return { sourcePort: 'exhausted', label: 'FAILED', branchLabel: 'FAILED', style: 'failure', condition: null, routeType: 'error' };
  if (sourceHandle === 'error') return { sourcePort: 'error', label: 'ERROR', branchLabel: 'FAILED', style: 'failure', condition: null, routeType: 'error' };
  if (sourceHandle?.startsWith('branch-')) return { sourcePort: sourceHandle, label: dynamicLabel || 'Branch', branchLabel: null, style: 'conditional', condition: null, routeType: 'conditional' };
  if (sourceHandle?.startsWith('route-')) {
    const routeNumber = Number(sourceHandle.slice('route-'.length)) || 1;
    return { sourcePort: sourceHandle, label: `Path ${routeNumber}`, branchLabel: null, style: 'conditional', condition: null, routeType: 'conditional' };
  }
  return { sourcePort: 'output', label: 'SUCCESS', branchLabel: 'SUCCESS', style: 'success', condition: null, routeType: 'success' };
};
const record = (state: EditorState): Pick<EditorState, 'past' | 'future'> => ({ past: [...state.past.slice(-49), snapshot(state)], future: [] });
const isLibraryItem = (value: ManualLibraryItem | WorkflowNode['category']): value is ManualLibraryItem => typeof value === 'object';
const freePosition = (nodes: EditorNode[], requested?: XYPosition): XYPosition => {
  const origin = requested ?? { x: 120, y: 120 };
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = { x: origin.x + (attempt % 5) * 34, y: origin.y + Math.floor(attempt / 5) * 34 };
    const overlaps = nodes.some((node) => Math.abs(node.position.x - candidate.x) < 260 && Math.abs(node.position.y - candidate.y) < 145);
    if (!overlaps) return candidate;
  }
  return { x: origin.x + nodes.length * 28, y: origin.y + nodes.length * 24 };
};

export const useEditorStore = create<EditorState>((set, get) => ({
  nodes: [], edges: [], workflow: null as unknown as Project['workflow'], selectedNodeId: null, selectedEdgeId: null, past: [], future: [],
  initialize(project) {
    const loadedWorkflow = structuredClone(project.workflow);
    const workflow = loadedWorkflow.connections.length ? loadedWorkflow : inferWorkflowConnections(loadedWorkflow);
    const projected = projectWorkflowToVisualGraph(workflow);
    const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
    const savedPositions = new Map(project.visualGraph.nodes.map((node) => [node.data.domainNodeId, node.position]));
    const connectionsById = new Map(workflow.connections.map((connection) => [connection.id, connection]));
    const nodes = projected.nodes.flatMap((visual) => {
      const domain = byId.get(visual.data.domainNodeId);
      return domain ? [{ ...visual, type: 'workflow' as const, position: savedPositions.get(domain.id) ?? visual.position, data: nodeData(domain, project.platform) }] : [];
    });
    const edges = projected.edges.flatMap((edge) => {
      const domain = connectionsById.get(edge.data.domainConnectionId);
      return domain ? [{ ...edge, type: 'smoothstep' as const, data: edge.data, ...edgePresentation(domain) }] : [];
    });
    set({ workflow, nodes, edges, selectedNodeId: null, selectedEdgeId: null, past: [], future: [] });
  },
  onNodesChange(changes) {
    set((state) => {
      const history = changes.some((change) => change.type === 'remove' || (change.type === 'position' && change.dragging === false)) ? record(state) : { past: state.past, future: state.future };
      const removedVisualIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
      const removedDomainIds = new Set(state.nodes.filter((node) => removedVisualIds.has(node.id)).map((node) => node.data.domainNodeId));
      return { ...history, nodes: applyNodeChanges(changes, state.nodes), workflow: removedDomainIds.size ? { ...state.workflow, nodes: state.workflow.nodes.filter((node) => !removedDomainIds.has(node.id)), connections: state.workflow.connections.filter((edge) => !removedDomainIds.has(edge.sourceNodeId) && !removedDomainIds.has(edge.targetNodeId)) } : state.workflow, edges: removedDomainIds.size ? state.edges.filter((edge) => !removedVisualIds.has(edge.source) && !removedVisualIds.has(edge.target)) : state.edges, selectedNodeId: removedVisualIds.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId };
    });
  },
  onEdgesChange(changes) { set((state) => { const removed = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id)); const selected = changes.find((change): change is Extract<typeof change, { type: 'select' }> => change.type === 'select' && change.selected); return { ...(removed.size ? record(state) : {}), edges: applyEdgeChanges(changes as EdgeChange<EditorEdge>[], state.edges), workflow: removed.size ? { ...state.workflow, connections: state.workflow.connections.filter((edge) => !removed.has(`visual-${edge.id}`)) } : state.workflow, selectedEdgeId: selected?.id ?? (removed.has(state.selectedEdgeId ?? '') ? null : state.selectedEdgeId) }; }); },
  connect(connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    set((state) => {
      const source = state.nodes.find((node) => node.id === connection.source)?.data.domainNodeId; const target = state.nodes.find((node) => node.id === connection.target)?.data.domainNodeId;
      const sourceNode = state.workflow.nodes.find((node) => node.id === source);
      const targetNode = state.workflow.nodes.find((node) => node.id === target);
      if (isAiAttachmentNode(sourceNode!) || isAiAttachmentNode(targetNode!)) return state;
      const dynamicLabel = sourceNode ? readEditorBranches(sourceNode).find((branch) => branch.id === connection.sourceHandle)?.label : undefined;
      if (!source || !target || state.workflow.connections.some((edge) => edge.sourceNodeId === source && edge.targetNodeId === target && edge.sourcePort === (connection.sourceHandle ?? 'output') && edge.targetPort === (connection.targetHandle ?? 'input'))) return state;
      const id = crypto.randomUUID(); const domainConnection: WorkflowConnection = { id, sourceNodeId: source, targetNodeId: target, ...connectionSemantics(connection.sourceHandle, dynamicLabel), targetPort: connection.targetHandle ?? 'input', mappings: [] };
      return { ...record(state), edges: addEdge({ ...connection, id: `visual-${id}`, type: 'smoothstep', data: { domainConnectionId: id }, ...edgePresentation(domainConnection) }, state.edges), workflow: { ...state.workflow, connections: [...state.workflow.connections, domainConnection] } };
    });
  },
  reconnect(edge, connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    set((state) => {
      const domainId = edge.data?.domainConnectionId;
      const source = state.nodes.find((node) => node.id === connection.source)?.data.domainNodeId;
      const target = state.nodes.find((node) => node.id === connection.target)?.data.domainNodeId;
      if (!domainId || !source || !target || state.workflow.connections.some((item) => item.id !== domainId && item.sourceNodeId === source && item.targetNodeId === target && item.sourcePort === (connection.sourceHandle ?? 'output'))) return state;
      const current = state.workflow.connections.find((item) => item.id === domainId);
      if (!current) return state;
      if (isAiAttachmentConnection(current)) return state;
      const sourceNode = state.workflow.nodes.find((node) => node.id === source);
      const dynamicLabel = sourceNode ? readEditorBranches(sourceNode).find((branch) => branch.id === connection.sourceHandle)?.label : undefined;
      const updated: WorkflowConnection = { ...current, sourceNodeId: source, targetNodeId: target, ...connectionSemantics(connection.sourceHandle, dynamicLabel), targetPort: connection.targetHandle ?? 'input' };
      const visual = { ...edge, ...edgePresentation(updated) };
      return { ...record(state), edges: reconnectEdge<EditorEdge>(visual, connection, state.edges, { shouldReplaceId: false }), workflow: { ...state.workflow, connections: state.workflow.connections.map((item) => item.id === domainId ? updated : item) }, selectedEdgeId: edge.id };
    });
  },
  selectNode(id) { set({ selectedNodeId: id, selectedEdgeId: null }); },
  selectEdge(id) { set({ selectedEdgeId: id, selectedNodeId: null }); },
  updateSelected(patch) { set((state) => { const visual = state.nodes.find((node) => node.id === state.selectedNodeId); if (!visual) return state; const nextWorkflow = { ...state.workflow, nodes: state.workflow.nodes.map((node) => node.id === visual.data.domainNodeId ? { ...node, ...patch } : node) }; const domain = nextWorkflow.nodes.find((node) => node.id === visual.data.domainNodeId)!; return { ...record(state), workflow: nextWorkflow, nodes: state.nodes.map((node) => node.id === visual.id ? { ...node, data: nodeData(domain, visual.data.platform) } : node) }; }); },
  addSelectedBranch() { set((state) => { const visual = state.nodes.find((node) => node.id === state.selectedNodeId); const node = state.workflow.nodes.find((item) => item.id === visual?.data.domainNodeId); if (!visual || !node || branchControlFor(node) !== 'dynamic') return state; const branches = readEditorBranches(node); if (branches.length >= MAX_DYNAMIC_BRANCHES) return state; const next = [...branches, createEditorBranch(visual.data.platform, branches.length)]; const updated = { ...node, configuration: writeEditorBranches(node, next) }; return { ...record(state), workflow: { ...state.workflow, nodes: state.workflow.nodes.map((item) => item.id === node.id ? updated : item) }, nodes: state.nodes.map((item) => item.id === visual.id ? { ...item, data: nodeData(updated, visual.data.platform) } : item) }; }); },
  renameSelectedBranch(branchId, label) { set((state) => { const visual = state.nodes.find((node) => node.id === state.selectedNodeId); const node = state.workflow.nodes.find((item) => item.id === visual?.data.domainNodeId); if (!visual || !node) return state; const next = readEditorBranches(node).map((branch) => branch.id === branchId ? { ...branch, label } : branch); const updated = { ...node, configuration: writeEditorBranches(node, next) }; return { ...record(state), workflow: { ...state.workflow, nodes: state.workflow.nodes.map((item) => item.id === node.id ? updated : item), connections: state.workflow.connections.map((edge) => edge.sourceNodeId === node.id && edge.sourcePort === branchId ? { ...edge, label } : edge) }, nodes: state.nodes.map((item) => item.id === visual.id ? { ...item, data: nodeData(updated, visual.data.platform) } : item), edges: state.edges.map((edge) => edge.source === visual.id && edge.sourceHandle === branchId ? { ...edge, label } : edge) }; }); },
  moveSelectedBranch(branchId, direction) { set((state) => { const visual = state.nodes.find((node) => node.id === state.selectedNodeId); const node = state.workflow.nodes.find((item) => item.id === visual?.data.domainNodeId); if (!visual || !node) return state; const branches = readEditorBranches(node); const index = branches.findIndex((branch) => branch.id === branchId); const destination = index + direction; if (index < 0 || destination < 0 || destination >= branches.length) return state; const next = [...branches]; [next[index], next[destination]] = [next[destination]!, next[index]!]; const updated = { ...node, configuration: writeEditorBranches(node, next) }; return { ...record(state), workflow: { ...state.workflow, nodes: state.workflow.nodes.map((item) => item.id === node.id ? updated : item) }, nodes: state.nodes.map((item) => item.id === visual.id ? { ...item, data: nodeData(updated, visual.data.platform) } : item) }; }); },
  removeSelectedBranch(branchId) { set((state) => { const visual = state.nodes.find((node) => node.id === state.selectedNodeId); const node = state.workflow.nodes.find((item) => item.id === visual?.data.domainNodeId); if (!visual || !node) return state; const branches = readEditorBranches(node); if (branches.length <= 1 || !branches.some((branch) => branch.id === branchId)) return state; const updated = { ...node, configuration: writeEditorBranches(node, branches.filter((branch) => branch.id !== branchId)) }; return { ...record(state), workflow: { ...state.workflow, nodes: state.workflow.nodes.map((item) => item.id === node.id ? updated : item), connections: state.workflow.connections.filter((edge) => !(edge.sourceNodeId === node.id && edge.sourcePort === branchId)) }, nodes: state.nodes.map((item) => item.id === visual.id ? { ...item, data: nodeData(updated, visual.data.platform) } : item), edges: state.edges.filter((edge) => !(edge.source === visual.id && edge.sourceHandle === branchId)), selectedEdgeId: null }; }); },
  addNode(value, position, requestedPlatform) { const id = crypto.randomUUID(); set((state) => { const definition = isLibraryItem(value) ? value : { id: value, label: value.replace('_', ' '), category: value, service: null, operation: null }; const platform = requestedPlatform ?? state.nodes[0]?.data.platform ?? 'n8n'; const baseConfiguration = definition.configuration ?? {}; const configuration = baseConfiguration.editorBranchControl === 'dynamic' ? { ...baseConfiguration, editorBranches: [createEditorBranch(platform, 0)] } : baseConfiguration; const domain: WorkflowNode = { id, category: definition.category, name: definition.configuration?.manualCustomNode ? 'Custom Node' : `New ${definition.label}`, description: '', service: definition.service, operation: definition.operation, purpose: '', expectedResult: '', icon: definition.configuration?.manualCustomNode ? 'generic-custom' : `generic-${definition.category}`, estimatedExecution: 'Under 1 minute', inputs: [], outputs: [], credentials: [], configuration, status: 'unconfigured', configurationCompleteness: 0, conditions: [], decisionRule: null, notes: '', bestPractices: [], potentialErrors: [], alternativeImplementations: [], performanceNotes: [], securityNotes: [], riskLevel: 'low' }; const visual: EditorNode = { id: `visual-${id}`, type: 'workflow', position: freePosition(state.nodes, position), data: nodeData(domain, platform) }; return { ...record(state), workflow: { ...state.workflow, nodes: [...state.workflow.nodes, domain] }, nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), { ...visual, selected: true }], edges: state.edges.map((edge) => ({ ...edge, selected: false })), selectedNodeId: visual.id, selectedEdgeId: null }; }); return id; },
  addAiAttachment(agentId, option) {
    const id = crypto.randomUUID();
    let added = false;
    set((state) => {
      const agent = state.workflow.nodes.find((node) => node.id === agentId);
      if (state.workflow.targetPlatform !== 'n8n' || !agent || !isN8nAiAgent(agent)) return state;
      const kind = aiAttachmentPortFor(option.type);
      const existing = state.workflow.connections.filter((edge) => edge.targetNodeId === agentId && edge.connectionKind === kind);
      if (option.type !== 'tool' && existing.length) return state;
      const agentVisual = state.nodes.find((node) => node.data.domainNodeId === agentId);
      const position = freePosition(state.nodes, { x: (agentVisual?.position.x ?? 120) + (option.type === 'chat-model' ? -190 : option.type === 'memory' ? 40 : 270), y: (agentVisual?.position.y ?? 120) + 250 });
      const node: WorkflowNode = { id, category: 'ai', nodeKind: 'ai-attachment', attachmentType: option.type, attachmentSubtype: option.id, attachmentStatus: 'unconfigured', name: option.title, description: option.summary, service: option.service, operation: option.operation, purpose: 'Configure an n8n AI Agent dependency.', expectedResult: 'Attachment configuration is available to the AI Agent.', icon: `generic-ai`, estimatedExecution: 'Configuration attachment', inputs: [], outputs: [], credentials: [], configuration: { provider: option.id }, status: 'unconfigured', configurationCompleteness: 0, conditions: [], decisionRule: null, notes: '', bestPractices: [], potentialErrors: [], alternativeImplementations: [], performanceNotes: [], securityNotes: [], riskLevel: 'low' };
      const connectionId = crypto.randomUUID();
      const edge: WorkflowConnection = { id: connectionId, sourceNodeId: id, targetNodeId: agentId, connectionKind: kind, sourcePort: 'attachment', targetPort: kind, label: option.type === 'tool' ? 'Tool' : option.type === 'memory' ? 'Memory' : 'Chat Model', condition: null, routeType: 'default', branchLabel: null, style: 'default', mappings: [] };
      added = true;
      return { ...record(state), workflow: { ...state.workflow, nodes: [...state.workflow.nodes, node], connections: [...state.workflow.connections, edge] }, nodes: [...state.nodes.map((item) => ({ ...item, selected: false })), { id: `visual-${id}`, type: 'workflow', position, selected: true, data: nodeData(node, 'n8n') }], edges: [...state.edges.map((item) => ({ ...item, selected: false })), { id: `visual-${connectionId}`, source: `visual-${id}`, target: `visual-${agentId}`, type: 'smoothstep', data: { domainConnectionId: connectionId }, ...edgePresentation(edge) }], selectedNodeId: `visual-${id}`, selectedEdgeId: null };
    });
    return added ? id : null;
  },
  deleteNode(id) { set((state) => { const visualId = id ?? state.selectedNodeId; const visual = state.nodes.find((node) => node.id === visualId); if (!visual) return state; const domainId = visual.data.domainNodeId; return { ...record(state), nodes: state.nodes.filter((node) => node.id !== visual.id), edges: state.edges.filter((edge) => edge.source !== visual.id && edge.target !== visual.id), workflow: { ...state.workflow, nodes: state.workflow.nodes.filter((node) => node.id !== domainId), connections: state.workflow.connections.filter((edge) => edge.sourceNodeId !== domainId && edge.targetNodeId !== domainId) }, selectedNodeId: null, selectedEdgeId: null }; }); },
  deleteEdge(id) { set((state) => { const visualId = id ?? state.selectedEdgeId; const edge = state.edges.find((item) => item.id === visualId); if (!edge) return state; const domainId = edge.data?.domainConnectionId; return { ...record(state), edges: state.edges.filter((item) => item.id !== visualId), workflow: { ...state.workflow, connections: state.workflow.connections.filter((item) => item.id !== domainId) }, selectedEdgeId: null }; }); },
  duplicateSelected() { const state = get(); const visual = state.nodes.find((node) => node.id === state.selectedNodeId); const domain = state.workflow.nodes.find((node) => node.id === visual?.data.domainNodeId); if (!visual || !domain) return; const id = crypto.randomUUID(); const copy = { ...structuredClone(domain), id, name: `${domain.name} copy` }; set({ ...record(state), workflow: { ...state.workflow, nodes: [...state.workflow.nodes, copy] }, nodes: [...state.nodes, { ...visual, id: `visual-${id}`, position: { x: visual.position.x + 40, y: visual.position.y + 40 }, selected: false, data: nodeData(copy, visual.data.platform) }], selectedNodeId: `visual-${id}` }); },
  applyProposedWorkflow(workflow) { set((state) => { const existing = new Map(state.nodes.map((item) => [item.data.domainNodeId, item])); const platform = state.nodes[0]?.data.platform ?? 'n8n'; const nodes = workflow.nodes.map((domain, index) => { const current = existing.get(domain.id); return current ? { ...current, data: nodeData(domain, current.data.platform), selected: false } : { id: `visual-${domain.id}`, type: 'workflow' as const, position: { x: 100 + (index % 4) * 350, y: 100 + Math.floor(index / 4) * 230 }, data: nodeData(domain, platform) }; }); const edges = workflow.connections.map((edge) => ({ id: `visual-${edge.id}`, source: `visual-${edge.sourceNodeId}`, target: `visual-${edge.targetNodeId}`, type: 'smoothstep', data: { domainConnectionId: edge.id }, ...edgePresentation(edge) })); return { ...record(state), workflow: structuredClone(workflow), nodes, edges, selectedNodeId: null }; }); },
  autoLayout(direction = 'LR', domainNodeIds) { set((state) => {
    const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: direction, ranksep: 150, nodesep: 100, edgesep: 45 });
    const includedVisualIds = new Set(state.nodes
      .filter((node) => !isAiAttachmentNode(node.data.node) && (!domainNodeIds || domainNodeIds.has(node.data.domainNodeId)))
      .map((node) => node.id));
    state.nodes.filter((node) => includedVisualIds.has(node.id)).forEach((node) => {
      const mergeClearance = node.data.node.category === 'merge' ? 80 : 0;
      graph.setNode(node.id, { width: 290 + mergeClearance, height: 184 + mergeClearance });
    });
    state.edges.filter((edge) => includedVisualIds.has(edge.source) && includedVisualIds.has(edge.target)).forEach((edge) => graph.setEdge(edge.source, edge.target));
    dagre.layout(graph);
    const positions = new Map<string, XYPosition>();
    state.nodes.forEach((node) => {
      if (!includedVisualIds.has(node.id)) return;
      const point = graph.node(node.id) as { x: number; y: number };
      positions.set(node.id, { x: point.x - 145, y: point.y - 92 });
    });
    for (const domain of state.workflow.nodes.filter((node) => ['condition', 'filter'].includes(node.category))) {
      const positive = state.workflow.connections.find((edge) => edge.sourceNodeId === domain.id && edge.branchLabel === 'TRUE');
      const negative = state.workflow.connections.find((edge) => edge.sourceNodeId === domain.id && edge.branchLabel === 'FALSE');
      if (!positive || !negative) continue;
      const positiveId = `visual-${positive.targetNodeId}`; const negativeId = `visual-${negative.targetNodeId}`;
      const positivePoint = positions.get(positiveId); const negativePoint = positions.get(negativeId);
      if (!positivePoint || !negativePoint) continue;
      const axis = direction === 'LR' ? 'y' : 'x';
      if (positivePoint[axis] >= negativePoint[axis]) {
        const midpoint = (positivePoint[axis] + negativePoint[axis]) / 2;
        positions.set(positiveId, { ...positivePoint, [axis]: midpoint - 95 });
        positions.set(negativeId, { ...negativePoint, [axis]: midpoint + 95 });
      }
    }
    const branchAxis = direction === 'LR' ? 'y' : 'x';
    for (const domain of state.workflow.nodes.filter((node) => branchControlFor(node) === 'dynamic')) {
      const orderedTargets = readEditorBranches(domain).flatMap((branch) => {
        const connection = state.workflow.connections.find((edge) => edge.sourceNodeId === domain.id && edge.sourcePort === branch.id);
        const visualId = connection ? `visual-${connection.targetNodeId}` : null;
        const position = visualId ? positions.get(visualId) : undefined;
        return visualId && position ? [{ visualId, position }] : [];
      });
      if (orderedTargets.length < 2) continue;
      const slots = orderedTargets.map(({ position }) => position[branchAxis]).sort((left, right) => left - right);
      const center = slots.reduce((sum, value) => sum + value, 0) / slots.length;
      const spacing = direction === 'LR' ? 284 : 390;
      const firstSlot = center - (spacing * (slots.length - 1)) / 2;
      orderedTargets.forEach(({ visualId, position }, index) => {
        positions.set(visualId, { ...position, [branchAxis]: firstSlot + spacing * index });
      });
    }
    for (const merge of state.workflow.nodes.filter((node) => node.category === 'merge')) {
      const mergeId = `visual-${merge.id}`;
      const mergePosition = positions.get(mergeId);
      const incomingPositions = state.workflow.connections
        .filter((edge) => edge.targetNodeId === merge.id)
        .flatMap((edge) => {
          const position = positions.get(`visual-${edge.sourceNodeId}`);
          return position ? [position] : [];
        });
      if (!mergePosition || incomingPositions.length < 2) continue;
      const center = incomingPositions.reduce((sum, position) => sum + position[branchAxis], 0) / incomingPositions.length;
      positions.set(mergeId, { ...mergePosition, [branchAxis]: center });
    }
    const domainPositions = new Map(state.nodes.flatMap((node) => {
      const position = positions.get(node.id);
      return position && !isAiAttachmentNode(node.data.node) ? [[node.data.domainNodeId, position] as const] : [];
    }));
    for (const [domainId, position] of aiAttachmentPositions(state.workflow, domainPositions)) positions.set(`visual-${domainId}`, position);
    return {
      ...record(state),
      nodes: state.nodes.map((node) => {
        if (!includedVisualIds.has(node.id) && !isAiAttachmentNode(node.data.node)) return node;
        return { ...node, position: positions.get(node.id) ?? node.position };
      }),
    };
  }); },
  undo() { set((state) => { const previous = state.past.at(-1); if (!previous) return state; return { ...previous, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future], selectedNodeId: null, selectedEdgeId: null }; }); },
  redo() { set((state) => { const next = state.future[0]; if (!next) return state; return { ...next, past: [...state.past, snapshot(state)], future: state.future.slice(1), selectedNodeId: null, selectedEdgeId: null }; }); }
}));
