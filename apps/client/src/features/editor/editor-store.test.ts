import { describe, expect, it } from 'vitest';
import { createWorkflowSetFromGraph, leadQualificationWorkflow, projectWorkflowToVisualGraph, type Project } from '@awm/shared';
import { useEditorStore } from './editor-store';
import { manualLibraryFor } from './manual-platform-library';
import { branchControlFor, MAX_DYNAMIC_BRANCHES, readEditorBranches } from './editor-branches';

const blankProject = (platform: Project['platform'] = 'n8n'): Project => {
  const now = new Date().toISOString();
  const workflow = { ...leadQualificationWorkflow, nodes: [], connections: [], branches: [], clarificationQuestions: [], errorHandling: [], risks: [] };
  return {
    id: '70000000-0000-4000-8000-000000000020', name: 'Blank workflow', clientName: '', description: '', platform,
    status: 'draft', originalScope: '', workflow, workflowSet: createWorkflowSetFromGraph(workflow),
    visualGraph: projectWorkflowToVisualGraph(workflow), createdAt: now, updatedAt: now,
  };
};

const routerLayoutProject = (branches: Array<{ id: string; label: string; target: string }>): Project => {
  const base = blankProject('n8n');
  const router = {
    ...leadQualificationWorkflow.nodes[1]!,
    id: crypto.randomUUID(),
    category: 'router' as const,
    name: 'Choose destination',
    configuration: {
      editorBranchControl: 'dynamic',
      editorBranches: branches.map(({ id, label }, order) => ({ id, label, order })),
    },
  };
  const targets = [...branches].reverse().map(({ target }) => ({
    ...leadQualificationWorkflow.nodes[1]!,
    id: crypto.randomUUID(),
    name: target,
  }));
  const targetByName = new Map(targets.map((target) => [target.name, target]));
  const merge = {
    ...leadQualificationWorkflow.nodes[1]!,
    id: crypto.randomUUID(),
    category: 'merge' as const,
    name: 'Continue combined flow',
  };
  const routeConnections = branches.map((branch) => ({
    ...leadQualificationWorkflow.connections[0]!,
    id: crypto.randomUUID(),
    sourceNodeId: router.id,
    targetNodeId: targetByName.get(branch.target)!.id,
    sourcePort: branch.id,
    label: branch.label,
    branchLabel: null,
    routeType: 'conditional' as const,
    style: 'conditional' as const,
  }));
  const mergeConnections = targets.map((target) => ({
    ...leadQualificationWorkflow.connections[0]!,
    id: crypto.randomUUID(),
    sourceNodeId: target.id,
    targetNodeId: merge.id,
  }));
  const workflow = { ...base.workflow, nodes: [router, ...targets, merge], connections: [...routeConnections, ...mergeConnections] };
  return {
    ...base,
    workflow,
    workflowSet: createWorkflowSetFromGraph(workflow),
    visualGraph: projectWorkflowToVisualGraph(workflow),
  };
};

const repairedProviderIteratorProject = (): Project => {
  const base = blankProject('n8n');
  const iterator = { ...leadQualificationWorkflow.nodes[1]!, id: crypto.randomUUID(), category: 'loop' as const, name: 'Split Out attachments' };
  const body = { ...leadQualificationWorkflow.nodes[1]!, id: crypto.randomUUID(), name: 'Process attachment' };
  const continuation = { ...leadQualificationWorkflow.nodes[1]!, id: crypto.randomUUID(), name: 'Record completion' };
  const connection = leadQualificationWorkflow.connections[0]!;
  const connections: Project['workflow']['connections'] = [
    { ...connection, id: crypto.randomUUID(), sourceNodeId: iterator.id, targetNodeId: body.id, sourcePort: 'item', targetPort: 'input', label: 'Each Item', branchLabel: 'LOOP', style: 'loop' as const },
    { ...connection, id: crypto.randomUUID(), sourceNodeId: body.id, targetNodeId: iterator.id, sourcePort: 'loop-back', targetPort: 'loop-back', label: 'Loop Back', branchLabel: 'LOOP', style: 'loop' as const },
    { ...connection, id: crypto.randomUUID(), sourceNodeId: iterator.id, targetNodeId: continuation.id, sourcePort: 'done', targetPort: 'input', label: 'Completed', branchLabel: 'DONE', style: 'success' as const },
  ];
  const workflow = { ...base.workflow, nodes: [iterator, body, continuation], connections };
  return { ...base, workflow, workflowSet: createWorkflowSetFromGraph(workflow), visualGraph: projectWorkflowToVisualGraph(workflow) };
};

const positionByName = (name: string) => useEditorStore.getState().nodes.find((node) => node.data.node.name === name)!.position;

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

  it('projects persisted semantic router routes onto matching visible handles', () => {
    const base = blankProject('n8n');
    const router = {
      ...leadQualificationWorkflow.nodes[1]!,
      id: crypto.randomUUID(),
      category: 'router' as const,
      name: 'Route by department',
      configuration: {
        editorBranchControl: 'dynamic',
        editorBranches: [
          { id: 'route-1', label: 'Sales', order: 0 },
          { id: 'route-2', label: 'Technical Support', order: 1 },
          { id: 'route-3', label: 'Billing', order: 2 },
        ],
      },
    };
    const targets = ['Sales', 'Technical Support', 'Billing'].map((department) => ({
      ...leadQualificationWorkflow.nodes[1]!,
      id: crypto.randomUUID(),
      name: `Create ${department} department ticket`,
    }));
    const connections = targets.map((target, index) => ({
      ...leadQualificationWorkflow.connections[0]!,
      id: crypto.randomUUID(),
      sourceNodeId: router.id,
      targetNodeId: target.id,
      sourcePort: `route-${index + 1}`,
      label: ['Sales', 'Technical Support', 'Billing'][index]!,
      branchLabel: null,
      routeType: 'conditional' as const,
      style: 'conditional' as const,
    }));
    const workflow = { ...base.workflow, nodes: [router, ...targets], connections };
    const project = {
      ...base,
      workflow,
      workflowSet: createWorkflowSetFromGraph(workflow),
      visualGraph: projectWorkflowToVisualGraph(workflow),
    };

    useEditorStore.getState().initialize(project);

    expect(useEditorStore.getState().edges.map((edge) => ({
      sourceHandle: edge.sourceHandle,
      label: edge.label,
      target: useEditorStore.getState().nodes.find((node) => node.id === edge.target)?.data.node.name,
    }))).toEqual([
      { sourceHandle: 'route-1', label: 'Sales', target: 'Create Sales department ticket' },
      { sourceHandle: 'route-2', label: 'Technical Support', target: 'Create Technical Support department ticket' },
      { sourceHandle: 'route-3', label: 'Billing', target: 'Create Billing department ticket' },
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

  it('preserves canonical iterator boundaries and their presentation across initialization', () => {
    const project = repairedProviderIteratorProject();
    const originalConnections = structuredClone(project.workflow.connections);

    useEditorStore.getState().initialize(project);

    const presented = useEditorStore.getState().edges.map(({ label, sourceHandle, targetHandle }) => ({ label, sourceHandle, targetHandle }));
    expect(presented).toEqual(expect.arrayContaining([
      { label: 'Each Item', sourceHandle: 'item', targetHandle: null },
      { label: 'Loop Back', sourceHandle: 'loop-back', targetHandle: 'loop-back' },
      { label: 'Completed', sourceHandle: 'done', targetHandle: null },
    ]));
    expect(presented).toHaveLength(3);
    expect(presented.filter((edge) => edge.label === 'Each Item')).toHaveLength(1);
    expect(presented.filter((edge) => edge.label === 'Loop Back')).toHaveLength(1);
    expect(presented.filter((edge) => edge.label === 'Completed')).toHaveLength(1);
    expect(presented.some((edge) => edge.sourceHandle === 'default')).toBe(false);
    expect(useEditorStore.getState().workflow.connections).toEqual(originalConnections);

    const savedWorkflow = structuredClone(useEditorStore.getState().workflow);
    const reloaded = { ...project, workflow: savedWorkflow, visualGraph: projectWorkflowToVisualGraph(savedWorkflow) };
    useEditorStore.getState().initialize(reloaded);
    expect(useEditorStore.getState().workflow.connections).toEqual(originalConnections);
    expect(useEditorStore.getState().edges.map(({ label, sourceHandle, targetHandle }) => ({ label, sourceHandle, targetHandle }))).toEqual(presented);
  });

  it('keeps legacy inference for workflows with no connections', () => {
    const project = blankProject();
    project.workflow.nodes = [
      { ...leadQualificationWorkflow.nodes[0]!, id: crypto.randomUUID(), name: 'Receive request' },
      { ...leadQualificationWorkflow.nodes[1]!, id: crypto.randomUUID(), name: 'Handle request' },
    ];

    useEditorStore.getState().initialize(project);

    expect(useEditorStore.getState().workflow.connections).toHaveLength(1);
    expect(useEditorStore.getState().edges[0]).toMatchObject({ sourceHandle: 'default', targetHandle: null });
  });

  it('keeps retry-loop labels while manual iterator outputs retain item and done semantics', () => {
    useEditorStore.getState().initialize(blankProject());
    useEditorStore.getState().addNode('loop');
    useEditorStore.getState().addNode('action');
    useEditorStore.getState().addNode('action');
    const [iterator, body, continuation] = useEditorStore.getState().nodes;
    useEditorStore.getState().connect({ source: iterator!.id, sourceHandle: 'item', target: body!.id, targetHandle: null });
    useEditorStore.getState().connect({ source: iterator!.id, sourceHandle: 'done', target: continuation!.id, targetHandle: null });
    expect(useEditorStore.getState().edges.map((edge) => edge.label)).toEqual(['Each Item', 'Completed']);

    const retryProject = repairedProviderIteratorProject();
    retryProject.workflow.connections[1] = { ...retryProject.workflow.connections[1]!, sourcePort: 'output', targetPort: 'input', label: 'Retry', branchLabel: 'FAILED', style: 'loop' };
    retryProject.visualGraph = projectWorkflowToVisualGraph(retryProject.workflow);
    useEditorStore.getState().initialize(retryProject);
    expect(useEditorStore.getState().edges.find((edge) => edge.data?.domainConnectionId === retryProject.workflow.connections[1]!.id)?.label).toBe('Retry');
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

  it.each([
    [
      { id: 'branch-zeta', label: 'North queue', target: 'Handle cobalt request' },
      { id: 'branch-alpha', label: 'Central queue', target: 'Handle amber request' },
    ],
    [
      { id: 'branch-third', label: 'Gamma lane', target: 'Prepare orchid record' },
      { id: 'branch-first', label: 'Alpha lane', target: 'Prepare quartz record' },
      { id: 'branch-fourth', label: 'Delta lane', target: 'Prepare cedar record' },
      { id: 'branch-second', label: 'Beta lane', target: 'Prepare willow record' },
    ],
  ])('places %i configured router targets in branch order and centers their merge', (...branches) => {
    const project = routerLayoutProject(branches);
    const semantics = structuredClone(project.workflow.connections);
    useEditorStore.getState().initialize(project);
    useEditorStore.getState().autoLayout('LR');

    const targetYs = branches.map((branch) => positionByName(branch.target).y);
    expect(targetYs).toEqual([...targetYs].sort((left, right) => left - right));
    expect(targetYs.slice(1).map((value, index) => value - targetYs[index]!)).toEqual(
      Array.from({ length: targetYs.length - 1 }, () => 284),
    );
    expect(positionByName('Continue combined flow').y).toBeCloseTo(targetYs.reduce((sum, value) => sum + value, 0) / targetYs.length);
    expect(positionByName('Continue combined flow').x - Math.max(...branches.map((branch) => positionByName(branch.target).x))).toBeGreaterThanOrEqual(440);
    expect(useEditorStore.getState().workflow.connections).toEqual(semantics);
  });

  it('changes only visual order when configured router branches are reordered', () => {
    const branches = [
      { id: 'branch-one', label: 'Crimson choice', target: 'Process lunar item' },
      { id: 'branch-two', label: 'Ivory choice', target: 'Process solar item' },
      { id: 'branch-three', label: 'Teal choice', target: 'Process stellar item' },
    ];
    const project = routerLayoutProject(branches);
    const semantics = structuredClone(project.workflow.connections);
    useEditorStore.getState().initialize(project);
    useEditorStore.getState().autoLayout('LR');
    const firstOrder = branches.map((branch) => positionByName(branch.target).y);

    const reordered = structuredClone(project);
    const router = reordered.workflow.nodes.find((node) => node.category === 'router')!;
    router.configuration.editorBranches = [...branches].reverse().map(({ id, label }, order) => ({ id, label, order }));
    useEditorStore.getState().initialize(reordered);
    useEditorStore.getState().autoLayout('LR');
    const secondOrder = branches.map((branch) => positionByName(branch.target).y);

    expect(firstOrder).toEqual([...firstOrder].sort((left, right) => left - right));
    expect(secondOrder).toEqual([...secondOrder].sort((left, right) => right - left));
    expect(useEditorStore.getState().workflow.connections).toEqual(semantics);
  });

  it('enforces generic minimum horizontal spacing between adjacent execution nodes', () => {
    useEditorStore.getState().initialize(blankProject());
    useEditorStore.getState().addNode('trigger');
    useEditorStore.getState().addNode('action');
    useEditorStore.getState().addNode('end');
    const [trigger, action, end] = useEditorStore.getState().nodes;
    useEditorStore.getState().connect({ source: trigger!.id, sourceHandle: 'default', target: action!.id, targetHandle: null });
    useEditorStore.getState().connect({ source: action!.id, sourceHandle: 'default', target: end!.id, targetHandle: null });

    useEditorStore.getState().autoLayout('LR');

    const [first, second, third] = useEditorStore.getState().nodes.map((node) => node.position.x);
    expect(second! - first!).toBeGreaterThanOrEqual(440);
    expect(third! - second!).toBeGreaterThanOrEqual(440);
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

  it.each([
    ['zapier', 'paths'],
    ['make', 'router'],
    ['n8n', 'router'],
  ] as const)('%s dynamic routing can add multiple stable outputs', (platform, itemId) => {
    useEditorStore.getState().initialize(blankProject(platform));
    useEditorStore.getState().addNode(manualLibraryFor(platform).items.find((item) => item.id === itemId)!, undefined, platform);
    const initial = readEditorBranches(useEditorStore.getState().workflow.nodes[0]!);
    useEditorStore.getState().addSelectedBranch();
    useEditorStore.getState().addSelectedBranch();
    const branches = readEditorBranches(useEditorStore.getState().workflow.nodes[0]!);
    expect(branches).toHaveLength(3);
    expect(branches[0]!.id).toBe(initial[0]!.id);
    expect(new Set(branches.map((branch) => branch.id)).size).toBe(3);
  });

  it('keeps n8n IF fixed to TRUE and FALSE rather than dynamic outputs', () => {
    useEditorStore.getState().initialize(blankProject('n8n'));
    useEditorStore.getState().addNode(manualLibraryFor('n8n').items.find((item) => item.id === 'condition')!, undefined, 'n8n');
    const node = useEditorStore.getState().workflow.nodes[0]!;
    expect(branchControlFor(node)).toBe('fixed-binary');
    useEditorStore.getState().addSelectedBranch();
    expect(readEditorBranches(useEditorStore.getState().workflow.nodes[0]!)).toHaveLength(0);
  });

  it('preserves existing edges when branches are added or reordered', () => {
    useEditorStore.getState().initialize(blankProject('make'));
    useEditorStore.getState().addNode(manualLibraryFor('make').items.find((item) => item.id === 'router')!, undefined, 'make');
    useEditorStore.getState().addNode('action');
    const [router, target] = useEditorStore.getState().nodes;
    const firstBranch = readEditorBranches(useEditorStore.getState().workflow.nodes[0]!)[0]!;
    useEditorStore.getState().selectNode(router!.id);
    useEditorStore.getState().connect({ source: router!.id, sourceHandle: firstBranch.id, target: target!.id, targetHandle: null });
    const connectionId = useEditorStore.getState().workflow.connections[0]!.id;
    useEditorStore.getState().addSelectedBranch();
    const secondBranch = readEditorBranches(useEditorStore.getState().workflow.nodes[0]!)[1]!;
    useEditorStore.getState().moveSelectedBranch(secondBranch.id, -1);
    expect(useEditorStore.getState().workflow.connections).toHaveLength(1);
    expect(useEditorStore.getState().workflow.connections[0]).toMatchObject({ id: connectionId, sourcePort: firstBranch.id });
  });

  it('removes only the selected branch and its own edge', () => {
    useEditorStore.getState().initialize(blankProject('zapier'));
    useEditorStore.getState().addNode(manualLibraryFor('zapier').items.find((item) => item.id === 'paths')!, undefined, 'zapier');
    useEditorStore.getState().addSelectedBranch();
    useEditorStore.getState().addNode('action');
    useEditorStore.getState().addNode('action');
    const [paths, firstTarget, secondTarget] = useEditorStore.getState().nodes;
    useEditorStore.getState().selectNode(paths!.id);
    const [first, second] = readEditorBranches(useEditorStore.getState().workflow.nodes[0]!);
    useEditorStore.getState().connect({ source: paths!.id, sourceHandle: first!.id, target: firstTarget!.id, targetHandle: null });
    useEditorStore.getState().connect({ source: paths!.id, sourceHandle: second!.id, target: secondTarget!.id, targetHandle: null });
    useEditorStore.getState().removeSelectedBranch(first!.id);
    expect(readEditorBranches(useEditorStore.getState().workflow.nodes[0]!).map((branch) => branch.id)).toEqual([second!.id]);
    expect(useEditorStore.getState().workflow.connections).toHaveLength(1);
    expect(useEditorStore.getState().workflow.connections[0]!.sourcePort).toBe(second!.id);
  });

  it('enforces the centralized 20-branch limit', () => {
    useEditorStore.getState().initialize(blankProject('n8n'));
    useEditorStore.getState().addNode(manualLibraryFor('n8n').items.find((item) => item.id === 'router')!, undefined, 'n8n');
    for (let index = 1; index < MAX_DYNAMIC_BRANCHES + 5; index += 1) useEditorStore.getState().addSelectedBranch();
    expect(readEditorBranches(useEditorStore.getState().workflow.nodes[0]!)).toHaveLength(MAX_DYNAMIC_BRANCHES);
  });

  it('restores saved branch IDs, labels, order, and connections after reload', () => {
    useEditorStore.getState().initialize(blankProject('make'));
    useEditorStore.getState().addNode(manualLibraryFor('make').items.find((item) => item.id === 'router')!, undefined, 'make');
    useEditorStore.getState().addSelectedBranch();
    useEditorStore.getState().addNode('action');
    const [router, target] = useEditorStore.getState().nodes;
    useEditorStore.getState().selectNode(router!.id);
    const branches = readEditorBranches(useEditorStore.getState().workflow.nodes[0]!);
    useEditorStore.getState().renameSelectedBranch(branches[1]!.id, 'VIP customers');
    useEditorStore.getState().connect({ source: router!.id, sourceHandle: branches[1]!.id, target: target!.id, targetHandle: null });
    const state = useEditorStore.getState();
    const saved: Project = { ...blankProject('make'), workflow: structuredClone(state.workflow), visualGraph: { nodes: state.nodes.map((node) => ({ id: node.id, type: 'workflow', position: node.position, data: { domainNodeId: node.data.domainNodeId } })), edges: [] } };
    useEditorStore.getState().initialize(saved);
    expect(readEditorBranches(useEditorStore.getState().workflow.nodes[0]!)[1]).toMatchObject({ id: branches[1]!.id, label: 'VIP customers', order: 1 });
    expect(useEditorStore.getState().workflow.connections[0]).toMatchObject({ sourcePort: branches[1]!.id, label: 'VIP customers' });
  });
});
