import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { DeterministicSkeletonCompiler } from './deterministic-skeleton-compiler.js';
import { N8nConceptualTranslator } from './n8n-translator.js';
import { V21AnalysisService } from './v2-analysis-service.js';

const translate = (scope: string) => {
  const detected = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z'));
  const v21 = new V21AnalysisService().analyze(scope, detected);
  const v22 = new DeterministicSkeletonCompiler().compileV22(v21);
  return { v22, translated: new N8nConceptualTranslator().translate(v22.graph) };
};

describe('V2.3A n8n conceptual translator', () => {
  it('maps binary and three-way decisions to IF and Switch without cross-platform terms', () => {
    const binary = translate('Did the lead respond? If yes notify Slack; if no send Gmail.').translated;
    const multi = translate('A reviewer must approve, reject, or request revision before the process continues.').translated;
    expect(binary.nodes.some((node) => node.primitiveType === 'if')).toBe(true);
    expect(multi.nodes.some((node) => node.primitiveType === 'switch')).toBe(true);
    expect(JSON.stringify([binary.nodes, multi.nodes])).not.toMatch(/Paths by Zapier|Make\.com Router/i);
  });

  it('preserves conditional parallel branches and synchronizes required approvers', () => {
    const { translated } = translate('Both finance and legal must approve before continuing.');
    expect(translated.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitiveType: 'switch' }),
      expect.objectContaining({ primitiveType: 'merge', event: 'Combine' }),
    ]));
    expect(translated.edges.map((edge) => edge.label)).toEqual(v22EdgeLabels('Both finance and legal must approve before continuing.'));
  });

  it('maps event waits with correlation metadata and delay waits to approved Wait modes', () => {
    const event = translate('Wait until the signature is received, then resume after signature completion.').translated;
    const delay = translate('Wait for 2 days before continuing.').translated;
    const eventWait = event.nodes.find((node) => node.primitiveType === 'wait');
    expect(eventWait).toMatchObject({ event: 'On webhook call' });
    expect(eventWait?.configuration.correlationIdentifier).toMatch(/^event:/);
    expect(delay.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ primitiveType: 'wait', event: 'After time interval' })]));
  });

  it('maps iterator and aggregator boundaries to n8n collection primitives', () => {
    const { translated } = translate('For every attachment, process the file and combine all results into one report.');
    expect(translated.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitiveType: 'loop', event: 'Loop Over Items' }),
      expect.objectContaining({ primitiveType: 'aggregate', event: 'Aggregate All Item Data' }),
    ]));
  });

  it('preserves revision loop-back and exit edge semantics', () => {
    const { translated } = translate('Send the request back for revision and resubmission until the manager accepts it.');
    expect(translated.nodes.some((node) => node.primitiveType === 'if' && node.configuration.boundedCycle === true)).toBe(true);
    expect(translated.edges.some((edge) => /revision|resubmit|return/i.test(edge.label))).toBe(true);
    expect(translated.edges.some((edge) => /accepted|complete|continue/i.test(edge.label))).toBe(true);
  });

  it('represents bounded retry, error handling, resume, and sub-workflow boundaries', () => {
    const retry = translate('Retry the API three times with exponential backoff. After final failure, handle the error and resume after remediation.').translated;
    const subworkflow = translate('Invoke the reusable sub-workflow to provision the customer workspace.').translated;
    expect(retry.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ primitiveType: 'action', configuration: expect.objectContaining({ retryOnFail: true, maximumAttempts: 3 }) }),
      expect.objectContaining({ primitiveType: 'error_trigger' }),
      expect.objectContaining({ primitiveType: 'edit_fields', configuration: expect.objectContaining({ boundary: 'resume' }) }),
    ]));
    expect(subworkflow.nodes.some((node) => node.primitiveType === 'execute_workflow')).toBe(true);
  });

  it('preserves conceptual traceability, evidence, confidence, lifecycle, and operations', () => {
    const { v22, translated } = translate('When a lead enters the Qualified stage, search the lead, update the lead record, and notify the owner.');
    const conceptual = v22.graph.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    const implementation = translated.nodes.find((node) => node.conceptualNodeIds.includes(conceptual.id))!;
    expect(implementation).toMatchObject({
      capabilityGroupIds: conceptual.capabilityGroupIds,
      evidenceIds: conceptual.evidenceIds,
      sourceReferences: conceptual.sourceReferences,
      confidence: conceptual.confidence,
      lifecycleStage: conceptual.lifecycleStage,
      underlyingOperations: conceptual.underlyingOperations,
    });
  });

  it('emits a structured warning rather than inventing an unsupported operation', () => {
    const { v22 } = translate('When a lead arrives, update the lead.');
    const capability = v22.graph.nodes.find((node) => node.capabilityGroupIds.length > 0)!;
    capability.underlyingOperations = ['shopify.fulfill-order'];
    const translated = new N8nConceptualTranslator().translate(v22.graph);
    expect(translated.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'N8N_OPERATION_UNAVAILABLE', kind: 'unsupported-feature' }),
    ]));
    expect(translated.nodes.find((node) => node.conceptualNodeIds.includes(capability.id))).toMatchObject({
      applicationId: null,
      operationId: null,
    });
  });

  it('remains shadow-only and validates approved n8n primitive terminology', () => {
    const { translated } = translate('If the invoice is approved, notify finance; otherwise stop.');
    expect(translated).toMatchObject({
      version: '2.3A',
      shadowMode: true,
      selectedPlatform: 'n8n',
      diagnostics: { platformLeakageCount: 0, invalidOperationReferenceCount: 0, valid: true },
    });
  });
});

const v22EdgeLabels = (scope: string) => {
  const detected = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z'));
  const v21 = new V21AnalysisService().analyze(scope, detected);
  return new DeterministicSkeletonCompiler().compileV22(v21).graph.edges.map((edge) => edge.label);
};
