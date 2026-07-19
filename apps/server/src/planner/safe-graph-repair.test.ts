import { describe, expect, it } from 'vitest';
import type { V22ConceptualGraph, V22ConceptualNode } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';
import { MakeConceptualTranslator } from './make-translator.js';
import { N8nConceptualTranslator } from './n8n-translator.js';
import { SafeGraphRepairService } from './safe-graph-repair.js';
import { V21AnalysisService } from './v2-analysis-service.js';

const service = new SafeGraphRepairService();
const compile = (scope: string) => {
  const detected = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z'));
  const v21 = new V21AnalysisService().analyze(scope, detected);
  const graph = new DeterministicSkeletonCompiler().compileV22(v21).graph;
  return { v21, graph };
};

describe('V2.4B safe deterministic graph repair', () => {
  it('restores missing conceptual source traceability without mutating the original', () => {
    const { v21, graph } = compile('When an Asana lead arrives, retrieve the task and notify the owner.');
    const target = graph.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    target.sourceReferences = [];
    const original = structuredClone(graph);
    const result = service.repair(v21, graph);
    expect(result.conceptual.graph.nodes.find((node) => node.id === target.id)?.sourceReferences.length).toBeGreaterThan(0);
    expect(result.conceptual.report.actions).toEqual(expect.arrayContaining([expect.objectContaining({ repairKind: 'restore-traceability', status: 'applied' })]));
    expect(graph).toEqual(original);
  });

  it('restores conceptual references, source references, capability groups, lifecycle, and confidence on platform nodes', () => {
    const { v21, graph } = compile('When an Asana lead enters Qualified, retrieve the task and notify the owner.');
    const translated = new N8nConceptualTranslator().translate(graph);
    const target = translated.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    target.conceptualNodeIds = [];
    target.sourceReferences = [];
    target.capabilityGroupIds = [];
    target.lifecycleStage = null;
    target.confidence = 0;
    const result = service.repair(v21, graph, translated).platform!;
    const repaired = result.graph.nodes.find((node) => node.id === target.id)!;
    expect(repaired.conceptualNodeIds.length).toBe(1);
    expect(repaired.sourceReferences.length).toBeGreaterThan(0);
    expect(repaired.capabilityGroupIds.length).toBeGreaterThan(0);
    expect(repaired.confidence).toBeGreaterThan(0);
  });

  it('restores exact branch labels and conceptual edge references', () => {
    const { v21, graph } = compile('Did the lead respond? If yes notify Slack; if no send Gmail.');
    const translated = new N8nConceptualTranslator().translate(graph);
    const target = translated.edges.find((edge) => edge.label === 'TRUE')!;
    const expected = graph.edges.find((edge) => target.conceptualEdgeIds.includes(edge.id))!;
    target.label = 'Continue';
    target.conceptualEdgeIds = [];
    const result = service.repair(v21, graph, translated).platform!;
    const repaired = result.graph.edges.find((edge) => edge.id === target.id)!;
    expect(repaired.label).toBe(expected.label);
    expect(repaired.conceptualEdgeIds).toContain(expected.id);
  });

  it('restores iterator and aggregation metadata only from existing conceptual facts', () => {
    const { v21, graph } = compile('For every attachment, process the file and combine all results into one report.');
    const translated = new N8nConceptualTranslator().translate(graph);
    const iterator = translated.nodes.find((node) => node.configuration.conceptualRole === 'collection-iterator')!;
    const aggregator = translated.nodes.find((node) => node.configuration.conceptualRole === 'item-aggregator')!;
    delete iterator.configuration.collectionSource;
    delete aggregator.configuration.aggregationInputEdgeIds;
    const result = service.repair(v21, graph, translated).platform!;
    expect(result.graph.nodes.find((node) => node.id === iterator.id)?.configuration.collectionSource).toBeTruthy();
    expect(result.graph.nodes.find((node) => node.id === aggregator.id)?.configuration.aggregationInputEdgeIds).toEqual(expect.any(Array));
  });

  it('restores retry and wait correlation metadata without changing source policy', () => {
    const retryCase = compile('Retry the API three times with exponential backoff. After final failure, handle the error and resume after remediation.');
    const retryTranslation = new N8nConceptualTranslator().translate(retryCase.graph);
    const retryNode = retryTranslation.nodes.find((node) => node.configuration.conceptualRole === 'technical-retry')!;
    delete retryNode.configuration.retry;
    delete retryNode.configuration.maximumAttempts;
    const retryResult = service.repair(retryCase.v21, retryCase.graph, retryTranslation).platform!;
    expect(retryResult.graph.nodes.find((node) => node.id === retryNode.id)?.configuration.retry).toEqual({ maximumAttempts: 3, backoff: 'exponential backoff' });

    const waitCase = compile('Wait until the signature is received, then resume after signature completion.');
    const waitTranslation = new N8nConceptualTranslator().translate(waitCase.graph);
    const waitNode = waitTranslation.nodes.find((node) => node.configuration.conceptualRole === 'event-wait')!;
    delete waitNode.configuration.wait;
    delete waitNode.configuration.correlationIdentifier;
    const waitResult = service.repair(waitCase.v21, waitCase.graph, waitTranslation).platform!;
    const repairedWait = waitResult.graph.nodes.find((node) => node.id === waitNode.id)!;
    expect(repairedWait.configuration.correlationIdentifier).toMatch(/^event:/);
    expect(repairedWait.configuration.wait).toEqual(expect.objectContaining({ correlationIdentifier: expect.stringMatching(/^event:/) }));
  });

  it('adds missing warnings and normalizes exact duplicate warnings and references', () => {
    const { v21, graph } = compile('When a lead arrives, update the lead.');
    const translated = new N8nConceptualTranslator().translate(graph);
    const target = translated.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    target.configuration.unresolvedApplicationOperation = true;
    translated.warnings = translated.warnings.filter((warning) => !warning.conceptualNodeIds.includes(target.conceptualNodeIds[0]!));
    target.evidenceIds.push(...target.evidenceIds);
    const duplicate = translated.warnings[0];
    if (duplicate) translated.warnings.push(structuredClone(duplicate));
    const result = service.repair(v21, graph, translated).platform!;
    expect(result.graph.warnings.some((warning) => warning.code === 'N8N_OPERATION_UNRESOLVED')).toBe(true);
    expect(new Set(result.graph.warnings.map(warningKey)).size).toBe(result.graph.warnings.length);
    expect(new Set(result.graph.nodes.find((node) => node.id === target.id)!.evidenceIds).size).toBe(result.graph.nodes.find((node) => node.id === target.id)!.evidenceIds.length);
  });

  it('skips synchronization and nested-decision restructuring', () => {
    const parallel = compile('Both finance and legal must approve before continuing.');
    const make = new MakeConceptualTranslator().translate(parallel.graph);
    const parallelResult = service.repair(parallel.v21, parallel.graph, make);
    expect(parallelResult.platform?.graph.nodes.map((node) => node.id)).toEqual(make.nodes.map((node) => node.id));
    expect(parallelResult.platform?.graph.edges.map((edge) => [edge.source, edge.target])).toEqual(make.edges.map((edge) => [edge.source, edge.target]));
    expect(parallelResult.platform?.report.actions.some((action) =>
      action.repairKind === 'canonical-normalization' && action.nodeIds.length > 1
    )).toBe(false);

    const nested = nestedBinaryGraph();
    const nestedResult = service.repair(nested.v21, nested.graph);
    expect(nestedResult.conceptual.report.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceIssueCode: 'CRITIC_NESTED_BINARY_MULTI_OUTCOME', status: 'skipped' }),
    ]));
  });

  it('does not invent unknown correlation identifiers or collection sources', () => {
    const waitCase = compile('Wait until the signature is received, then resume after signature completion.');
    const wait = waitCase.graph.nodes.find((node) => node.role === 'event-wait')!;
    wait.wait = { resumeCondition: 'signature received', timeoutPolicy: null, correlationIdentifier: null };
    const waitTranslation = new N8nConceptualTranslator().translate(waitCase.graph);
    delete waitTranslation.nodes.find((node) => node.configuration.conceptualRole === 'event-wait')!.configuration.correlationIdentifier;
    const waitResult = service.repair(waitCase.v21, waitCase.graph, waitTranslation).platform!;
    expect(waitResult.graph.nodes.find((node) => node.configuration.conceptualRole === 'event-wait')!.configuration.correlationIdentifier).toBeUndefined();

    const collectionCase = compile('For every attachment, process the file and combine all results.');
    const iterator = collectionCase.graph.nodes.find((node) => node.role === 'collection-iterator')!;
    iterator.collectionSource = null;
    const collectionTranslation = new N8nConceptualTranslator().translate(collectionCase.graph);
    delete collectionTranslation.nodes.find((node) => node.configuration.conceptualRole === 'collection-iterator')!.configuration.collectionSource;
    const collectionResult = service.repair(collectionCase.v21, collectionCase.graph, collectionTranslation).platform!;
    expect(collectionResult.graph.nodes.find((node) => node.configuration.conceptualRole === 'collection-iterator')!.configuration.collectionSource).toBeUndefined();
  });

  it('rolls back a validation-failing repair atomically', () => {
    const { v21, graph } = compile('Did the lead respond? If yes notify Slack; if no send Gmail.');
    const translated = new N8nConceptualTranslator().translate(graph);
    const edge = translated.edges.find((item) => item.label === 'TRUE')!;
    edge.label = 'Continue';
    const guarded = new SafeGraphRepairService(undefined, (kind) => kind === 'platform' ? ['forced validation failure'] : []);
    const result = guarded.repair(v21, graph, translated);
    expect(result.platform?.graph.edges.find((item) => item.id === edge.id)?.label).toBe('Continue');
    expect(result.platform?.report.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ repairKind: 'restore-branch-label', status: 'skipped', skipReason: expect.stringContaining('forced validation failure') }),
    ]));
  });

  it('is graph-idempotent and revalidates and re-critiques repaired output', () => {
    const { v21, graph } = compile('Did the lead respond? If yes notify Slack; if no send Gmail.');
    const translated = new N8nConceptualTranslator().translate(graph);
    translated.edges[0]!.label = 'Continue';
    const first = service.repair(v21, graph, translated);
    const second = service.repair(v21, first.conceptual.graph, first.platform?.graph);
    expect(second.conceptual.graph).toEqual(first.conceptual.graph);
    expect(second.platform?.graph).toEqual(first.platform?.graph);
    expect(first.platform?.report.validation.valid).toBe(true);
    expect(first.platform?.report.afterCritique.version).toBe('2.4A');
  });
});

function nestedBinaryGraph() {
  const compiled = compile('When a request arrives, complete the workflow.');
  const base = compiled.graph;
  const trigger = base.nodes.find((node) => node.role === 'workflow-trigger')!;
  const terminal = base.nodes.find((node) => node.role === 'meaningful-end')!;
  const source = { ...trigger.sourceReferences[0]!, stepId: 'route-step', text: 'Route by status: new, active, otherwise closed.' };
  const decision = (id: string): V22ConceptualNode => ({
    ...structuredClone(trigger), id, role: 'binary-decision', title: `Check ${id}`, purpose: 'Route by status.',
    sourceReferences: [source], underlyingOperations: ['route by status'], terminalOutcome: null,
  });
  const first = decision('decision-1');
  const second = decision('decision-2');
  const template = structuredClone(base.edges[0]!);
  const graph: V22ConceptualGraph = {
    ...base,
    nodes: [trigger, first, second, terminal],
    edges: [
      { ...template, id: 'e1', source: trigger.id, target: first.id, role: 'flow', label: 'Continue', sourceReferences: [source] },
      { ...template, id: 'e2', source: first.id, target: second.id, role: 'true', label: 'TRUE', sourceReferences: [source] },
      { ...template, id: 'e3', source: first.id, target: terminal.id, role: 'false', label: 'FALSE', sourceReferences: [source] },
      { ...template, id: 'e4', source: second.id, target: terminal.id, role: 'true', label: 'TRUE', sourceReferences: [source] },
    ],
    entryNodeId: trigger.id,
    terminalNodeIds: [terminal.id],
  };
  return { ...compiled, graph };
}

function warningKey(value: { code: string; kind: string; message: string; conceptualNodeIds: string[]; capabilityRefs: string[] }) {
  return `${value.code}:${value.kind}:${value.message}:${[...value.conceptualNodeIds].sort().join(',')}:${[...value.capabilityRefs].sort().join(',')}`;
}
