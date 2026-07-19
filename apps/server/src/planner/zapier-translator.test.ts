import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';
import { V21AnalysisService } from './v2-analysis-service.js';
import { ZapierConceptualTranslator } from './zapier-translator.js';

const translate = (scope: string) => {
  const detected = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z'));
  const v21 = new V21AnalysisService().analyze(scope, detected);
  const v22 = new DeterministicSkeletonCompiler().compileV22(v21);
  return { v22, translated: new ZapierConceptualTranslator().translate(v22.graph) };
};

describe('V2.3C Zapier conceptual translator', () => {
  it('maps visible binary and multi-outcome decisions to Paths', () => {
    const binary = translate('Did the lead respond? If yes notify Slack; if no send Gmail.').translated;
    const multi = translate('A reviewer must approve, reject, or request revision before the process continues.').translated;
    expect(binary.nodes.some((node) => node.primitiveType === 'paths')).toBe(true);
    expect(multi.nodes.some((node) => node.primitiveType === 'paths')).toBe(true);
  });

  it('uses Filter for a validation gate and Delay for a time boundary', () => {
    const validationGraph = translate('When an invoice arrives, process the invoice.').v22.graph;
    validationGraph.nodes.find((node) => node.capabilityGroupIds.length > 0)!.role = 'validation-gate';
    const validation = new ZapierConceptualTranslator().translate(validationGraph);
    const delay = translate('Wait for 2 days before continuing.').translated;
    expect(validation.nodes.some((node) => node.primitiveType === 'filter')).toBe(true);
    expect(delay.nodes.some((node) => node.primitiveType === 'delay')).toBe(true);
  });

  it('maps collections to Looping and aggregation to Digest with explicit limitations', () => {
    const { translated } = translate('For every attachment, process the file and combine all results into one report.');
    expect(translated.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitiveType: 'looping', event: 'Create Loop From Line Items' }),
      expect.objectContaining({ primitiveType: 'digest' }),
    ]));
    expect(translated.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ZAPIER_LOOPING_LIMITATION' }),
      expect.objectContaining({ code: 'ZAPIER_AGGREGATION_LIMITATION' }),
    ]));
  });

  it('maps approval request and preserves external-event correlation as continuation semantics', () => {
    const approval = translate('A reviewer must approve, reject, or request revision before the process continues.').translated;
    const event = translate('Wait until the signature is received, then resume after signature completion.').translated;
    expect(approval.nodes.some((node) => node.primitiveType === 'approval')).toBe(true);
    expect(event.nodes.find((node) => node.primitiveType === 'canonical-continuation')).toMatchObject({
      configuration: { correlationIdentifier: expect.stringMatching(/^event:/) },
    });
    expect(event.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ZAPIER_EVENT_WAIT_LIMITATION' })]));
  });

  it('maps sub-workflows to Sub-Zap and retains bounded retry as metadata', () => {
    const subworkflow = translate('Invoke the reusable sub-workflow to provision the customer workspace.').translated;
    const retry = translate('Retry the API three times with exponential backoff. After final failure, handle the error and resume after remediation.').translated;
    expect(subworkflow.nodes.some((node) => node.primitiveType === 'sub_zap')).toBe(true);
    expect(retry.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitiveType: 'canonical-continuation', configuration: expect.objectContaining({ requiresSupportedReplay: true }) }),
      expect.objectContaining({ primitiveType: 'error' }),
    ]));
    expect(retry.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ZAPIER_RETRY_LIMITATION' }),
      expect.objectContaining({ code: 'ZAPIER_ERROR_PATH_LIMITATION' }),
    ]));
  });

  it('warns for unsupported synchronization instead of inventing a merge primitive', () => {
    const { translated } = translate('Both finance and legal must approve before continuing.');
    expect(translated.nodes.some((node) => node.primitiveType === 'canonical-continuation')).toBe(true);
    expect(translated.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ZAPIER_MERGE_UNSUPPORTED' })]));
  });

  it('warns rather than inventing unsupported application operations', () => {
    const { v22 } = translate('When a lead arrives, update the lead.');
    const capability = v22.graph.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    capability.underlyingOperations = ['shopify.fulfill-order'];
    const translated = new ZapierConceptualTranslator().translate(v22.graph);
    expect(translated.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ZAPIER_OPERATION_UNAVAILABLE' })]));
    expect(translated.nodes.find((node) => node.conceptualNodeIds.includes(capability.id))).toMatchObject({ applicationId: null, operationId: null });
  });

  it('preserves traceability and rejects n8n or Make terminology leakage', () => {
    const { v22, translated } = translate('When an Asana lead enters Qualified, retrieve the task and notify the owner.');
    const conceptual = v22.graph.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    expect(translated.nodes.find((node) => node.conceptualNodeIds.includes(conceptual.id))).toMatchObject({
      capabilityGroupIds: conceptual.capabilityGroupIds,
      evidenceIds: conceptual.evidenceIds,
      sourceReferences: conceptual.sourceReferences,
      lifecycleStage: conceptual.lifecycleStage,
      confidence: conceptual.confidence,
    });
    expect(JSON.stringify(translated.nodes)).not.toMatch(/\bIF\b|Switch|Merge|Router|Iterator|Aggregate|Execute Workflow|Make\.com module|n8n/i);
    expect(translated).toMatchObject({
      version: '2.3C', shadowMode: true, selectedPlatform: 'zapier',
      diagnostics: { platformLeakageCount: 0, invalidOperationReferenceCount: 0, valid: true },
    });
  });

  it('keeps termination canonical and shadow-only', () => {
    const { translated } = translate('When the request arrives, notify the owner and complete the workflow.');
    expect(translated.nodes.some((node) => node.primitiveType === 'canonical-terminal')).toBe(true);
    expect(translated.shadowMode).toBe(true);
  });
});
