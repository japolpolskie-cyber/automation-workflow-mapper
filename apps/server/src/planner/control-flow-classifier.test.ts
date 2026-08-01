import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { ControlFlowClassifier } from './control-flow-classifier.js';

const classify = (scope: string) => new ControlFlowClassifier().classify(
  scope,
  new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z')),
);

describe('V2.1 central control-flow classifier', () => {
  it('classifies exactly two mutually exclusive outcomes as a binary decision', () => {
    const result = classify('If the request is approved then continue else reject it.');
    expect(result.find((item) => item.type === 'binary-decision')).toMatchObject({
      branchExclusivity: 'exclusive',
      branchesMayExecuteTogether: false,
    });
  });

  it.each([
    'If the payment succeeds, send a receipt; otherwise notify finance.',
    'If the lead agrees, continue qualification; otherwise end the sequence.',
    'When the record is valid, save it; if not, send it for review.',
    'Process approved requests, otherwise archive them.',
    'If inventory is available, create the order. Else notify the customer.',
  ])('classifies a bounded clause-level alternate as a binary decision: %s', (scope) => {
    expect(classify(scope).some((item) => item.type === 'binary-decision')).toBe(true);
  });

  it.each([
    'Send a receipt if an email address is present.',
    'Archive the record if requested.',
  ])('does not classify descriptive if language without an alternate: %s', (scope) => {
    expect(classify(scope).some((item) => item.type === 'binary-decision')).toBe(false);
  });

  it('classifies three mutually exclusive outcomes as a multi-outcome decision', () => {
    const result = classify('Route by status: if new send to sales else if pending send to review otherwise archive.');
    expect(result.find((item) => item.type === 'multi-outcome-decision')).toMatchObject({
      branchExclusivity: 'exclusive',
      branchesMayExecuteTogether: false,
    });
  });

  it('classifies multiple approver rules as conditional parallel routing with synchronization', () => {
    const result = classify('Both finance and legal must approve before continuing.');
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'conditional-parallel-routing', branchesMayExecuteTogether: true, synchronizationRequired: true }),
      expect.objectContaining({ type: 'merge-all', synchronizationRequired: true }),
    ]));
  });

  it('keeps human approval distinct from a plain condition and includes wait semantics', () => {
    const result = classify('The finance manager must approve the invoice before payment.');
    const approval = result.find((item) => item.type === 'approval');
    expect(approval?.wait).toMatchObject({ kind: 'human' });
    expect(result.some((item) => item.type === 'binary-decision')).toBe(false);
  });

  it.each([
    'Send the post to the manager for approval.',
    'Wait until the supervisor approves or rejects the request.',
    'Require human review before publishing.',
    'If approved, continue; otherwise return for revision.',
  ])('classifies an explicit approval action or boundary: %s', (scope) => {
    expect(classify(scope).some((item) => item.type === 'approval')).toBe(true);
  });

  it.each([
    'Retrieve approved social posts.',
    'Publish approved content.',
    'Archive approved requests.',
    'Notify users about approved records.',
  ])('does not classify an existing approved status as a new approval boundary: %s', (scope) => {
    expect(classify(scope).some((item) => item.type === 'approval')).toBe(false);
  });

  it('classifies external signature and payment dependencies as event waits', () => {
    for (const scope of ['Wait until the signature is received.', 'Await payment before onboarding.']) {
      expect(classify(scope).find((item) => item.type === 'event-wait')?.wait).toMatchObject({ kind: 'external-event' });
    }
  });

  it('classifies collection iteration and aggregation separately', () => {
    expect(classify('For every attachment, scan the file.').find((item) => item.type === 'iterator')).toMatchObject({ collectionSource: 'attachment' });
    expect(classify('Combine all results into one report.').find((item) => item.type === 'aggregator')).toBeDefined();
  });

  it('classifies revision and resubmission as a loop with a traceable exit', () => {
    const loop = classify('Send back for revision and resubmission until the manager accepts it.').find((item) => item.type === 'loop-until');
    expect(loop?.loop).toMatchObject({ exitCondition: 'the manager accepts it' });
  });

  it('extracts retry attempts and exponential backoff', () => {
    const retry = classify('Retry the API three times with exponential backoff.').find((item) => item.type === 'retry');
    expect(retry?.retryPolicy).toEqual({ maximumAttempts: 3, backoff: 'exponential backoff' });
  });

  it('preserves source requirement references for every classification', () => {
    const result = classify('For every invoice, retry the API 3 times with fixed backoff.');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.sourceReferences.every((reference) => reference.text.length > 0 && reference.end > reference.start))).toBe(true);
  });
});
