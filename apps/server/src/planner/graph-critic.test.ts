import { describe, expect, it } from 'vitest';
import type { V22ConceptualGraph, V22ConceptualNode } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';
import { GraphCritic } from './graph-critic.js';
import { MakeConceptualTranslator } from './make-translator.js';
import { N8nConceptualTranslator } from './n8n-translator.js';
import { V21AnalysisService } from './v2-analysis-service.js';

const critic = new GraphCritic();
const compile = (scope: string) => {
  const detected = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z'));
  const v21 = new V21AnalysisService().analyze(scope, detected);
  return new DeterministicSkeletonCompiler().compileV22(v21).graph;
};
const codes = (result: ReturnType<GraphCritic['critiqueConceptual']>) => result.issues.map((issue) => issue.code);

describe('V2.4A deterministic shadow Graph Critic', () => {
  it('detects generic business labels', () => {
    const graph = compile('When a lead arrives, notify the owner.');
    graph.nodes.find((node) => node.capabilityGroupIds.length > 0)!.title = 'Action';
    expect(codes(critic.critiqueConceptual(graph))).toContain('CRITIC_GENERIC_BUSINESS_LABEL');
  });

  it('detects sentence-level fragmentation across a linear operation chain', () => {
    const graph = fragmentedGraph();
    expect(codes(critic.critiqueConceptual(graph))).toContain('CRITIC_ONE_NODE_PER_SENTENCE_FRAGMENTATION');
  });

  it('detects nested binary decisions that encode one multi-outcome route', () => {
    const graph = nestedBinaryGraph();
    expect(codes(critic.critiqueConceptual(graph))).toContain('CRITIC_NESTED_BINARY_MULTI_OUTCOME');
  });

  it('detects missing synchronization after parallel branches using the existing validator', () => {
    const graph = compile('Both finance and legal must approve before continuing.');
    const merge = graph.nodes.find((node) => node.role === 'merge-all')!;
    graph.nodes = graph.nodes.filter((node) => node.id !== merge.id);
    graph.edges = graph.edges.filter((edge) => edge.source !== merge.id && edge.target !== merge.id);
    expect(codes(critic.critiqueConceptual(graph))).toContain('CRITIC_V22_PARALLEL_SYNCHRONIZATION_REQUIRED');
  });

  it('detects waits without resume semantics and event waits without correlation', () => {
    const graph = compile('Wait until the signature is received, then resume after signature completion.');
    const wait = graph.nodes.find((node) => node.role === 'event-wait')!;
    wait.wait = { resumeCondition: '', timeoutPolicy: null, correlationIdentifier: null };
    expect(codes(critic.critiqueConceptual(graph))).toEqual(expect.arrayContaining([
      'CRITIC_V22_WAIT_RESUME_REQUIRED',
      'CRITIC_V22_EVENT_CORRELATION_REQUIRED',
    ]));
  });

  it('detects iterator and aggregator boundary defects', () => {
    const graph = compile('For every attachment, process the file and combine all results into one report.');
    const iterator = graph.nodes.find((node) => node.role === 'collection-iterator')!;
    const aggregator = graph.nodes.find((node) => node.role === 'item-aggregator')!;
    iterator.collectionSource = null;
    graph.edges.filter((edge) => edge.target === aggregator.id).forEach((edge) => { edge.role = 'flow'; });
    expect(codes(critic.critiqueConceptual(graph))).toEqual(expect.arrayContaining([
      'CRITIC_V22_ITERATOR_SOURCE_REQUIRED',
      'CRITIC_V22_AGGREGATOR_RESULTS_REQUIRED',
    ]));
  });

  it('detects unbounded retry and missing exhausted path', () => {
    const graph = compile('Retry the API three times with exponential backoff. After final failure, handle the error and resume after remediation.');
    const retry = graph.nodes.find((node) => node.role === 'technical-retry')!;
    retry.retry = null;
    graph.edges = graph.edges.filter((edge) => !(edge.source === retry.id && edge.role === 'retry-exhausted'));
    expect(codes(critic.critiqueConceptual(graph))).toEqual(expect.arrayContaining([
      'CRITIC_V22_RETRY_BOUND_REQUIRED',
      'CRITIC_V22_RETRY_PATHS_REQUIRED',
    ]));
  });

  it('detects weak terminal outcomes', () => {
    const graph = compile('When a lead arrives, notify the owner.');
    const terminal = graph.nodes.find((node) => node.role === 'meaningful-end')!;
    terminal.terminalOutcome = 'Done';
    expect(codes(critic.critiqueConceptual(graph))).toContain('CRITIC_WEAK_TERMINAL_OUTCOME');
  });

  it('detects platform leakage through the existing platform validator', () => {
    const graph = compile('Did the lead respond? If yes notify Slack; if no send Gmail.');
    const translated = new MakeConceptualTranslator().translate(graph);
    translated.nodes[0]!.label = 'n8n IF node';
    expect(critic.critiquePlatform(graph, translated).issues.map((issue) => issue.code)).toContain('CRITIC_MAKE_PLATFORM_LEAKAGE');
  });

  it('detects unresolved operations without structured warnings', () => {
    const graph = compile('When a lead arrives, update the lead.');
    const translated = new N8nConceptualTranslator().translate(graph);
    const implementation = translated.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    implementation.configuration.unresolvedApplicationOperation = true;
    translated.warnings = translated.warnings.filter((warning) => !warning.conceptualNodeIds.some((id) => implementation.conceptualNodeIds.includes(id)));
    expect(critic.critiquePlatform(graph, translated).issues.map((issue) => issue.code)).toContain('CRITIC_UNSUPPORTED_OPERATION_WITHOUT_WARNING');
  });

  it('detects conceptual-role and traceability loss', () => {
    const graph = compile('When a lead arrives, notify the owner.');
    const translated = new N8nConceptualTranslator().translate(graph);
    const implementation = translated.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    implementation.configuration.conceptualRole = 'logging';
    implementation.sourceReferences = [];
    const issueCodes = critic.critiquePlatform(graph, translated).issues.map((issue) => issue.code);
    expect(issueCodes).toEqual(expect.arrayContaining([
      'CRITIC_N8N_TRACEABILITY_MISSING',
      'CRITIC_CONCEPTUAL_ROLE_LOSS',
      'CRITIC_PLATFORM_TRACEABILITY_GAP',
    ]));
  });

  it('reports branch-label and control-metadata loss', () => {
    const graph = compile('Wait until the signature is received, then resume after signature completion.');
    const translated = new N8nConceptualTranslator().translate(graph);
    translated.edges[0]!.label = 'Changed';
    const wait = translated.nodes.find((node) => node.configuration.conceptualRole === 'event-wait')!;
    delete wait.configuration.wait;
    delete wait.configuration.correlationIdentifier;
    const issueCodes = critic.critiquePlatform(graph, translated).issues.map((issue) => issue.code);
    expect(issueCodes).toEqual(expect.arrayContaining(['CRITIC_BRANCH_LABEL_LOSS', 'CRITIC_CONTROL_METADATA_LOSS']));
  });

  it('produces metrics and no false critical findings for a clean graph', () => {
    const graph = compile('When an Asana lead arrives, retrieve the task details and notify the owner.');
    const conceptual = critic.critiqueConceptual(graph);
    const platform = critic.critiquePlatform(graph, new N8nConceptualTranslator().translate(graph));
    expect(conceptual.aggregate.errorCount).toBe(0);
    expect(platform.aggregate.errorCount).toBe(0);
    expect(platform.metrics).toMatchObject({
      nodeCount: expect.any(Number),
      edgeCount: expect.any(Number),
      traceabilityCoverage: 1,
      conceptualRolePreservationRate: 1,
      platformCapabilitySafetyRate: 1,
    });
  });
});

function fragmentedGraph(): V22ConceptualGraph {
  const base = compile('When a request arrives, complete the workflow.');
  const trigger = base.nodes.find((node) => node.role === 'workflow-trigger')!;
  const terminal = base.nodes.find((node) => node.role === 'meaningful-end')!;
  const source = trigger.sourceReferences[0]!;
  const fragments = Array.from({ length: 4 }, (_, index): V22ConceptualNode => ({
    ...structuredClone(trigger),
    id: `fragment-${index + 1}`,
    role: 'data-transformation',
    title: `Update business record ${index + 1}`,
    purpose: 'Update the same business record.',
    sourceReferences: [{ ...source, stepId: `step-${index + 1}`, start: index * 10, end: index * 10 + 5, text: `Update field group ${index + 1}` }],
    underlyingOperations: [`update field group ${index + 1}`],
    terminalOutcome: null,
  }));
  const nodes = [trigger, ...fragments, terminal];
  const edges = nodes.slice(0, -1).map((node, index) => ({
    ...structuredClone(base.edges[0]!),
    id: `fragment-edge-${index + 1}`,
    source: node.id,
    target: nodes[index + 1]!.id,
    role: 'flow' as const,
    label: 'Continue',
    sourceReferences: nodes[index + 1]!.sourceReferences,
  }));
  return { ...base, nodes, edges, entryNodeId: trigger.id, terminalNodeIds: [terminal.id] };
}

function nestedBinaryGraph(): V22ConceptualGraph {
  const base = compile('When a request arrives, complete the workflow.');
  const trigger = base.nodes.find((node) => node.role === 'workflow-trigger')!;
  const terminal = base.nodes.find((node) => node.role === 'meaningful-end')!;
  const source = { ...trigger.sourceReferences[0]!, stepId: 'route-step', text: 'Route by status: new, active, otherwise closed.' };
  const decision = (id: string): V22ConceptualNode => ({
    ...structuredClone(trigger), id, role: 'binary-decision', title: `Check ${id}`, purpose: 'Route by status.',
    sourceReferences: [source], underlyingOperations: ['route by status'], terminalOutcome: null,
  });
  const first = decision('decision-1');
  const second = decision('decision-2');
  const nodes = [trigger, first, second, terminal];
  const template = structuredClone(base.edges[0]!);
  const edges = [
    { ...template, id: 'e1', source: trigger.id, target: first.id, role: 'flow' as const, label: 'Continue', sourceReferences: [source] },
    { ...template, id: 'e2', source: first.id, target: second.id, role: 'true' as const, label: 'TRUE', sourceReferences: [source] },
    { ...template, id: 'e3', source: first.id, target: terminal.id, role: 'false' as const, label: 'FALSE', sourceReferences: [source] },
    { ...template, id: 'e4', source: second.id, target: terminal.id, role: 'true' as const, label: 'TRUE', sourceReferences: [source] },
  ];
  return { ...base, nodes, edges, entryNodeId: trigger.id, terminalNodeIds: [terminal.id] };
}
