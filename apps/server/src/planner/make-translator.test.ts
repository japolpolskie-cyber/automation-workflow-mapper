import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';
import { MakeConceptualTranslator } from './make-translator.js';
import { V21AnalysisService } from './v2-analysis-service.js';

const translate = (scope: string) => {
  const detected = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z'));
  const v21 = new V21AnalysisService().analyze(scope, detected);
  const v22 = new DeterministicSkeletonCompiler().compileV22(v21);
  return { v22, translated: new MakeConceptualTranslator().translate(v22.graph) };
};

describe('V2.3B Make conceptual translator', () => {
  it('maps binary and three-way decisions to Make filters and Router', () => {
    const binary = translate('Did the lead respond? If yes notify Slack; if no send Gmail.').translated;
    const multi = translate('A reviewer must approve, reject, or request revision before the process continues.').translated;
    expect(binary.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ primitiveType: 'filter', event: 'Filter bundle' })]));
    expect(multi.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ primitiveType: 'router', event: 'Router' })]));
  });

  it('maps conditional parallel approvals to filtered Router branches and warns at synchronization', () => {
    const { translated } = translate('Both finance and legal must approve before continuing.');
    expect(translated.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitiveType: 'router', configuration: expect.objectContaining({ routesMayExecuteTogether: true }) }),
      expect.objectContaining({ primitiveType: 'canonical-continuation' }),
    ]));
    expect(translated.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MAKE_SYNCHRONIZATION_LIMITATION' })]));
  });

  it('maps Iterator and Array Aggregator without treating Router as iteration', () => {
    const { translated } = translate('For every attachment, process the file and combine all results into one report.');
    expect(translated.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitiveType: 'iterator', event: 'Iterator' }),
      expect.objectContaining({ primitiveType: 'array_aggregator' }),
    ]));
  });

  it('maps approval request and preserves event correlation through a continuation boundary', () => {
    const approval = translate('A reviewer must approve, reject, or request revision before the process continues.').translated;
    const event = translate('Wait until the signature is received, then resume after signature completion.').translated;
    expect(approval.nodes.some((node) => node.primitiveType === 'approval')).toBe(true);
    const wait = event.nodes.find((node) => node.primitiveType === 'canonical-continuation');
    expect(wait).toMatchObject({ configuration: { correlationIdentifier: expect.stringMatching(/^event:/) } });
    expect(event.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MAKE_EVENT_CONTINUATION_REQUIRED' })]));
  });

  it('maps bounded retry, exhausted error handling, and sub-workflows to approved Make concepts', () => {
    const retry = translate('Retry the API three times with exponential backoff. After final failure, handle the error and resume after remediation.').translated;
    const subworkflow = translate('Invoke the reusable sub-workflow to provision the customer workspace.').translated;
    expect(retry.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitiveType: 'error_handler', configuration: expect.objectContaining({ bounded: true }) }),
      expect.objectContaining({ primitiveType: 'error_handler', configuration: expect.objectContaining({ errorPath: true }) }),
    ]));
    expect(subworkflow.nodes.some((node) => node.primitiveType === 'call_scenario')).toBe(true);
  });

  it('preserves a bounded revision loop and delay using Make primitives', () => {
    const loop = translate('Send the request back for revision and resubmission until the manager accepts it.').translated;
    const delay = translate('Wait for 2 days before continuing.').translated;
    expect(loop.nodes.some((node) => node.primitiveType === 'repeater' && node.configuration.boundedCycle === true)).toBe(true);
    expect(loop.edges.some((edge) => /revision|resubmit|return/i.test(edge.label))).toBe(true);
    expect(delay.nodes.some((node) => node.primitiveType === 'sleep')).toBe(true);
  });

  it('warns instead of inventing unsupported application operations', () => {
    const { v22 } = translate('When a lead arrives, update the lead.');
    const capability = v22.graph.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    capability.underlyingOperations = ['shopify.fulfill-order'];
    const translated = new MakeConceptualTranslator().translate(v22.graph);
    expect(translated.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MAKE_OPERATION_UNAVAILABLE' })]));
    expect(translated.nodes.find((node) => node.conceptualNodeIds.includes(capability.id))).toMatchObject({ applicationId: null, operationId: null });
  });

  it('preserves traceability and prevents n8n or Zapier terminology leakage', () => {
    const { v22, translated } = translate('When an Asana lead enters Qualified, retrieve the task and notify the owner.');
    const conceptual = v22.graph.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    expect(translated.nodes.find((node) => node.conceptualNodeIds.includes(conceptual.id))).toMatchObject({
      capabilityGroupIds: conceptual.capabilityGroupIds,
      evidenceIds: conceptual.evidenceIds,
      sourceReferences: conceptual.sourceReferences,
      confidence: conceptual.confidence,
      lifecycleStage: conceptual.lifecycleStage,
    });
    expect(JSON.stringify(translated.nodes)).not.toMatch(/IF node|n8n Merge|Execute Workflow|Paths by Zapier|Digest by Zapier|Storage by Zapier/i);
    expect(translated).toMatchObject({
      version: '2.3B', shadowMode: true, selectedPlatform: 'make',
      diagnostics: { platformLeakageCount: 0, invalidOperationReferenceCount: 0, valid: true },
    });
  });
});
