import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';
import { V21AnalysisService } from './v2-analysis-service.js';
import { validateV22ConceptualGraph } from './v2-conceptual-graph-validator.js';

const compile = (scope: string) => {
  const detected = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z'));
  const v21 = new V21AnalysisService().analyze(scope, detected);
  return { v21, result: new DeterministicSkeletonCompiler().compileV22(v21) };
};

describe('V2.2 platform-neutral conceptual topology', () => {
  it('models a three-way human review through wait, resume, and explicit outcomes', () => {
    const { result } = compile('A reviewer must approve, reject, or request revision before the process continues.');
    expect(result.validation.issues).toEqual([]);
    expect(result.graph.nodes.map((node) => node.role)).toEqual(expect.arrayContaining(['approval', 'event-wait', 'resume-point', 'multi-route-decision', 'merge-any']));
    const decision = result.graph.nodes.find((node) => node.role === 'multi-route-decision')!;
    expect(result.graph.edges.filter((edge) => edge.source === decision.id && edge.role === 'route')).toHaveLength(3);
  });

  it('models conditional parallel approvers and synchronizes all required responses', () => {
    const { result } = compile('Both finance and legal must approve before continuing.');
    expect(result.validation.issues).toEqual([]);
    expect(result.graph.nodes.map((node) => node.role)).toEqual(expect.arrayContaining(['conditional-parallel-routing', 'merge-all']));
    const split = result.graph.nodes.find((node) => node.role === 'conditional-parallel-routing')!;
    expect(result.graph.edges.filter((edge) => edge.source === split.id && edge.role === 'conditional-branch').length).toBeGreaterThanOrEqual(2);
  });

  it('models an external event wait with stable correlation and resume metadata', () => {
    const { result } = compile('Wait until the signature is received, then resume after signature completion.');
    const wait = result.graph.nodes.find((node) => node.role === 'event-wait');
    expect(result.validation.valid).toBe(true);
    expect(wait?.wait?.correlationIdentifier).toMatch(/^event:/);
    expect(result.graph.edges.some((edge) => edge.source === wait?.id && edge.role === 'resume')).toBe(true);
  });

  it('models iterator item processing and aggregation boundaries', () => {
    const { result } = compile('For every attachment, process the file and combine all results into one report.');
    expect(result.validation.valid).toBe(true);
    expect(result.graph.nodes.map((node) => node.role)).toEqual(expect.arrayContaining(['collection-iterator', 'item-aggregator']));
    const iterator = result.graph.nodes.find((node) => node.role === 'collection-iterator')!;
    const body = result.graph.edges.find((edge) => edge.source === iterator.id && edge.role === 'item')!.target;
    const aggregator = result.graph.nodes.find((node) => node.role === 'item-aggregator')!;
    expect(result.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: iterator.id, target: body, role: 'item', label: 'EACH ITEM' }),
      expect.objectContaining({ source: body, target: iterator.id, role: 'loop-back', label: 'LOOP BACK' }),
      expect.objectContaining({ source: iterator.id, target: aggregator.id, role: 'iteration-complete', label: 'COMPLETED' }),
    ]));
  });

  it.each([
    ['item path', 'item', 'V22_ITERATOR_ITEM_PATH_REQUIRED'],
    ['loop-back path', 'loop-back', 'V22_ITERATOR_LOOP_BACK_REQUIRED'],
    ['completion path', 'iteration-complete', 'V22_ITERATOR_COMPLETION_PATH_REQUIRED'],
  ] as const)('rejects an iterator missing its %s', (_name, role, code) => {
    const { result } = compile('For every attachment, process the file and combine all results into one report.');
    const broken = structuredClone(result.graph);
    const iterator = broken.nodes.find((node) => node.role === 'collection-iterator')!;
    broken.edges = broken.edges.filter((edge) => !(edge.role === role && (edge.source === iterator.id || edge.target === iterator.id)));
    expect(validateV22ConceptualGraph(broken)).toEqual(expect.arrayContaining([expect.objectContaining({ code, nodeId: iterator.id })]));
  });

  it('rejects duplicate loop-back paths and an unreachable iterator body', () => {
    const { result } = compile('For every attachment, process the file and combine all results into one report.');
    const duplicate = structuredClone(result.graph);
    const iterator = duplicate.nodes.find((node) => node.role === 'collection-iterator')!;
    const loopBack = duplicate.edges.find((edge) => edge.target === iterator.id && edge.role === 'loop-back')!;
    duplicate.edges.push({ ...loopBack, id: `${loopBack.id}-duplicate` });
    expect(validateV22ConceptualGraph(duplicate)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'V22_ITERATOR_LOOP_BACK_REQUIRED' })]));
    const unreachable = structuredClone(result.graph);
    const returnEdge = unreachable.edges.find((edge) => edge.target === iterator.id && edge.role === 'loop-back')!;
    returnEdge.source = unreachable.nodes.find((node) => node.role === 'meaningful-end')!.id;
    expect(validateV22ConceptualGraph(unreachable)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'V22_ITERATOR_BODY_UNREACHABLE' })]));
  });

  it('models revision and resubmission with explicit loop-back and exit paths', () => {
    const { result } = compile('Send the request back for revision and resubmission until the manager accepts it.');
    const loop = result.graph.nodes.find((node) => node.role === 'loop-until')!;
    expect(result.validation.issues).toEqual([]);
    expect(result.graph.edges.some((edge) => edge.target === loop.id && edge.role === 'loop-back')).toBe(true);
    expect(result.graph.edges.some((edge) => edge.source === loop.id && edge.role === 'loop-exit')).toBe(true);
  });

  it('models bounded retry exhaustion, failure handling, and resume', () => {
    const { result } = compile('Retry the API three times with exponential backoff. After final failure, handle the error and resume after remediation.');
    const retry = result.graph.nodes.find((node) => node.role === 'technical-retry')!;
    expect(result.validation.issues).toEqual([]);
    expect(retry.retry).toEqual({ maximumAttempts: 3, backoff: 'exponential backoff' });
    expect(result.graph.nodes.map((node) => node.role)).toEqual(expect.arrayContaining(['error-handler', 'resume-point']));
  });

  it('represents a reusable sub-workflow boundary and return', () => {
    const { result } = compile('Invoke the reusable sub-workflow to provision the customer workspace.');
    const subworkflow = result.graph.nodes.find((node) => node.role === 'sub-workflow')!;
    expect(result.validation.valid).toBe(true);
    expect(result.graph.edges.some((edge) => edge.source === subworkflow.id && edge.role === 'subworkflow-return')).toBe(true);
  });

  it('preserves capability metadata, evidence, confidence, lifecycle, operations, and source references', () => {
    const { v21, result } = compile('When a lead enters the Qualified stage, search the lead, update the lead record, and notify the owner.');
    const capability = result.graph.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    const source = v21.capabilityGroups.find((group) => group.id === capability.capabilityGroupIds[0])!;
    expect(capability).toMatchObject({
      factIds: source.operationFactIds,
      evidenceIds: source.evidenceIds,
      confidence: source.confidence,
      lifecycleStage: source.lifecycleStage,
    });
    expect(capability.underlyingOperations).toEqual(source.underlyingOperations.map((item) => item.operation));
    expect(capability.sourceReferences).toEqual(source.sourceReferences);
  });

  it('reports semantic validation failures without repairing the graph', () => {
    const { result } = compile('For every attachment, process the file and combine all results.');
    const broken = structuredClone(result.graph);
    const iterator = broken.nodes.find((node) => node.role === 'collection-iterator')!;
    iterator.collectionSource = null;
    expect(validateV22ConceptualGraph(broken)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'V22_ITERATOR_SOURCE_REQUIRED', nodeId: iterator.id }),
    ]));
  });

  it('keeps meaningful terminal outcomes and legacy K4.1 compatibility explicit', () => {
    const { result } = compile('When a request arrives, validate it and complete the workflow.');
    expect(result.graph.legacyK41Compatible).toBe(true);
    expect(result.graph.version).toBe('2.2');
    expect(result.graph.nodes.filter((node) => node.role === 'meaningful-end').every((node) => Boolean(node.terminalOutcome))).toBe(true);
  });
});
