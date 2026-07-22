import { describe, expect, it } from 'vitest';
import { createWorkflowSetFromGraph, leadQualificationWorkflow, projectWorkflowToVisualGraph, type Project } from '@awm/shared';
import { useEditorStore } from './editor-store';
import { manualLibraryFor } from './manual-platform-library';

const blankProject = (platform: Project['platform'] = 'n8n'): Project => {
  const now = new Date().toISOString();
  const workflow = { ...leadQualificationWorkflow, nodes: [], connections: [], branches: [], clarificationQuestions: [], errorHandling: [], risks: [] };
  return {
    id: '70000000-0000-4000-8000-000000000020', name: 'Blank workflow', clientName: '', description: '', platform,
    status: 'draft', originalScope: '', workflow, workflowSet: createWorkflowSetFromGraph(workflow),
    visualGraph: projectWorkflowToVisualGraph(workflow), createdAt: now, updatedAt: now,
  };
};

describe('editor workflow layout isolation', () => {
  it('lays out only nodes owned by the selected workflow', () => {
    const now = new Date().toISOString();
    const secondTrigger = {
      ...leadQualificationWorkflow.nodes[0]!,
      id: '70000000-0000-4000-8000-000000000001',
      name: 'Receive renewal reminder',
    };
    const secondAction = {
      ...leadQualificationWorkflow.nodes[1]!,
      id: '70000000-0000-4000-8000-000000000002',
      name: 'Prepare renewal offer',
    };
    const secondConnection = {
      ...leadQualificationWorkflow.connections[0]!,
      id: '70000000-0000-4000-8000-000000000003',
      sourceNodeId: secondTrigger.id,
      targetNodeId: secondAction.id,
    };
    const workflow = {
      ...leadQualificationWorkflow,
      nodes: [...leadQualificationWorkflow.nodes, secondTrigger, secondAction],
      connections: [...leadQualificationWorkflow.connections, secondConnection],
    };
    const workflowSet = createWorkflowSetFromGraph(workflow);
    const project: Project = {
      id: '70000000-0000-4000-8000-000000000010',
      name: 'Layout isolation',
      clientName: '',
      description: '',
      platform: 'make',
      status: 'ready',
      originalScope: '',
      workflow,
      workflowSet,
      visualGraph: projectWorkflowToVisualGraph(workflow),
      createdAt: now,
      updatedAt: now,
    };

    useEditorStore.getState().initialize(project);
    const secondWorkflowId = workflowSet.workflows.find((item) => item.name === secondTrigger.name)!.id;
    const secondDomainIds = new Set(workflowSet.nodeReferences
      .filter((reference) => reference.owningWorkflowId === secondWorkflowId)
      .map((reference) => reference.resourceId));
    const firstDomainIds = new Set(workflowSet.nodeReferences
      .filter((reference) => reference.owningWorkflowId !== secondWorkflowId)
      .map((reference) => reference.resourceId));
    const before = new Map(useEditorStore.getState().nodes
      .filter((node) => secondDomainIds.has(node.data.domainNodeId))
      .map((node) => [node.id, node.position]));

    useEditorStore.getState().autoLayout('TB', firstDomainIds);

    const after = useEditorStore.getState().nodes
      .filter((node) => secondDomainIds.has(node.data.domainNodeId));
    expect(after.every((node) => JSON.stringify(node.position) === JSON.stringify(before.get(node.id)))).toBe(true);
  });

  it('preserves platform-aware semantics for multiple manual router paths', () => {
    const project = blankProject('make');

    useEditorStore.getState().initialize(project);
    useEditorStore.getState().addNode('router');
    useEditorStore.getState().addNode('action');
    useEditorStore.getState().addNode('action');
    const [router, firstAction, secondAction] = useEditorStore.getState().nodes;

    useEditorStore.getState().connect({
      source: router!.id,
      sourceHandle: 'route-1',
      target: firstAction!.id,
      targetHandle: null,
    });
    useEditorStore.getState().connect({
      source: router!.id,
      sourceHandle: 'route-2',
      target: secondAction!.id,
      targetHandle: null,
    });

    const connections = useEditorStore.getState().workflow.connections;
    expect(connections).toHaveLength(2);
    expect(connections.map((connection) => ({
      sourcePort: connection.sourcePort,
      label: connection.label,
      routeType: connection.routeType,
    }))).toEqual([
      { sourcePort: 'route-1', label: 'Path 1', routeType: 'conditional' },
      { sourcePort: 'route-2', label: 'Path 2', routeType: 'conditional' },
    ]);
  });

  it('adds separate selected nodes at non-overlapping positions with platform metadata', () => {
    useEditorStore.getState().initialize(blankProject('zapier'));
    const action = manualLibraryFor('zapier').items.find((item) => item.id === 'action')!;
    useEditorStore.getState().addNode(action, { x: 400, y: 300 }, 'zapier');
    useEditorStore.getState().addNode(action, { x: 400, y: 300 }, 'zapier');
    const [first, second] = useEditorStore.getState().nodes;
    expect(first!.position).not.toEqual(second!.position);
    expect(second!.data.platform).toBe('zapier');
    expect(useEditorStore.getState().selectedNodeId).toBe(second!.id);
  });

  it('deletes one node and only its connected edges after confirmation calls the store action', () => {
    useEditorStore.getState().initialize(blankProject());
    useEditorStore.getState().addNode('trigger');
    useEditorStore.getState().addNode('action');
    useEditorStore.getState().addNode('end');
    const [trigger, action, end] = useEditorStore.getState().nodes;
    useEditorStore.getState().connect({ source: trigger!.id, sourceHandle: 'default', target: action!.id, targetHandle: null });
    useEditorStore.getState().connect({ source: action!.id, sourceHandle: 'default', target: end!.id, targetHandle: null });
    useEditorStore.getState().deleteNode(action!.id);
    expect(useEditorStore.getState().nodes.map((node) => node.id)).toEqual([trigger!.id, end!.id]);
    expect(useEditorStore.getState().edges).toHaveLength(0);
    expect(useEditorStore.getState().selectedNodeId).toBeNull();
  });

  it('deletes and reconnects edges without deleting either node', () => {
    useEditorStore.getState().initialize(blankProject());
    useEditorStore.getState().addNode('trigger');
    useEditorStore.getState().addNode('action');
    useEditorStore.getState().addNode('end');
    const [trigger, action, end] = useEditorStore.getState().nodes;
    useEditorStore.getState().connect({ source: trigger!.id, sourceHandle: 'default', target: action!.id, targetHandle: null });
    const edge = useEditorStore.getState().edges[0]!;
    useEditorStore.getState().reconnect(edge, { source: trigger!.id, sourceHandle: 'default', target: end!.id, targetHandle: null });
    expect(useEditorStore.getState().edges[0]!.target).toBe(end!.id);
    useEditorStore.getState().deleteEdge(edge.id);
    expect(useEditorStore.getState().edges).toHaveLength(0);
    expect(useEditorStore.getState().nodes).toHaveLength(3);
  });

  it('supports backward loop connections and manual custom-node persistence metadata', () => {
    useEditorStore.getState().initialize(blankProject('make'));
    const custom = manualLibraryFor('make').items.find((item) => item.id === 'custom')!;
    useEditorStore.getState().addNode('trigger', { x: 0, y: 0 });
    useEditorStore.getState().addNode('loop', { x: 500, y: 0 });
    useEditorStore.getState().addNode(custom, { x: 250, y: 200 }, 'make');
    const [, loop, customNode] = useEditorStore.getState().nodes;
    useEditorStore.getState().connect({ source: loop!.id, sourceHandle: 'item', target: customNode!.id, targetHandle: null });
    expect(useEditorStore.getState().workflow.connections[0]).toMatchObject({ branchLabel: 'LOOP', style: 'loop' });
    expect(customNode!.data.node.configuration).toMatchObject({ manualCustomNode: true, dynamicConnections: true });
  });

  it('places TRUE above FALSE during horizontal auto-layout', () => {
    useEditorStore.getState().initialize(blankProject());
    useEditorStore.getState().addNode('trigger');
    useEditorStore.getState().addNode('condition');
    useEditorStore.getState().addNode('action');
    useEditorStore.getState().addNode('notification');
    const [trigger, condition, trueNode, falseNode] = useEditorStore.getState().nodes;
    useEditorStore.getState().connect({ source: trigger!.id, sourceHandle: 'default', target: condition!.id, targetHandle: null });
    useEditorStore.getState().connect({ source: condition!.id, sourceHandle: 'positive', target: trueNode!.id, targetHandle: null });
    useEditorStore.getState().connect({ source: condition!.id, sourceHandle: 'negative', target: falseNode!.id, targetHandle: null });
    useEditorStore.getState().autoLayout('LR');
    const nodes = useEditorStore.getState().nodes;
    expect(nodes.find((node) => node.id === trueNode!.id)!.position.y).toBeLessThan(nodes.find((node) => node.id === falseNode!.id)!.position.y);
  });

  it('supports more than four router branches and preserves stable route handle IDs', () => {
    useEditorStore.getState().initialize(blankProject('zapier'));
    useEditorStore.getState().addNode('router');
    for (let index = 0; index < 8; index += 1) useEditorStore.getState().addNode('action');
    const [router, ...targets] = useEditorStore.getState().nodes;
    targets.forEach((target, index) => useEditorStore.getState().connect({ source: router!.id, sourceHandle: `route-${index + 1}`, target: target.id, targetHandle: null }));
    expect(useEditorStore.getState().workflow.connections).toHaveLength(8);
    expect(useEditorStore.getState().edges.map((edge) => edge.sourceHandle)).toEqual(['route-1', 'route-2', 'route-3', 'route-4', 'route-5', 'route-6', 'route-7', 'route-8']);
  });
});
