import { describe, expect, it } from 'vitest';
import { parseCapabilityDetectionResult } from '../capability-detection.js';
import { BinaryDecisionDetector, RouterDetector } from './decision-detectors.js';
import { ApprovalDetector, WaitDetector } from './wait-approval-detectors.js';

describe('WaitDetector', () => {
  const detector = new WaitDetector();

  it.each([
    ['Wait three days before following up.', 'duration', 'three days'],
    ['Hold processing until the invoice due date.', 'until-date', 'the invoice due date'],
    ['Pause until the signed document is received.', 'until-event', 'the signed document is received'],
    ['Wait until the customer replies.', 'until-response', 'the customer replies'],
    ['Resume after manager approval.', 'until-approval', 'manager approval'],
  ])('detects an explicit wait boundary: %s', (sourceRequirement, waitType, boundaryDescription) => {
    const result = detector.detect({ sourceRequirement });
    expect(parseCapabilityDetectionResult(result)).toEqual(result);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ nodeFunctionId: 'wait', metadata: { waitType, boundaryDescription } });
    expect(result.candidates[0]?.relatedEntityHints).toHaveLength(1);
    expect(result.candidates[0]?.relatedEntityHints[0]?.entityType).toBe('wait');
  });

  it.each([
    ['If approval is not received within two business days, keep the request pending.', 'until-approval'],
    ['Allow the customer 48 hours to reply before escalating the case.', 'until-response'],
    ['The request remains pending until the manager responds.', 'until-response'],
    ['Do not process the refund before manager approval.', 'until-approval'],
    ['Continue once the signed agreement has been received.', 'until-event'],
    ['Hold the invoice until its due date.', 'until-date'],
    ['After seven days without a response, notify the account owner.', 'until-response'],
  ])('detects a natural semantic wait boundary: %s', (sourceRequirement, waitType) => {
    const result = detector.detect({ sourceRequirement });
    expect(parseCapabilityDetectionResult(result)).toEqual(result);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ nodeFunctionId: 'wait', metadata: { waitType } });
  });

  it('preserves duration, event, timeout outcome, and exact evidence for an approval timeout', () => {
    const sourceRequirement = 'Before any refund is issued, a manager must approve the request. If approval is not received within two business days, keep the request pending and notify the case owner.';
    const result = detector.detect({ sourceRequirement });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.metadata).toMatchObject({
      waitType: 'until-approval',
      boundaryDescription: 'manager approval within two business days',
      durationDescription: 'two business days',
      eventDescription: 'manager approval',
      timeoutOutcome: 'keep the request pending and notify the case owner',
    });
    expect(sourceRequirement.slice(result.evidence[0]!.sourceStart, result.evidence[0]!.sourceEnd)).toBe(result.evidence[0]!.sourceText);
  });

  it('preserves response timeout handling', () => {
    const result = detector.detect({ sourceRequirement: 'Allow the customer 48 hours to reply before escalating the case.' });
    expect(result.candidates[0]?.metadata).toMatchObject({ durationDescription: '48 hours', eventDescription: 'customer reply', timeoutOutcome: 'escalate the case' });
    expect(result.candidates[0]?.explanation).toMatch(/times out, escalate the case/i);
  });

  it('does not duplicate semantic and fallback Wait candidates', () => {
    expect(detector.detect({ sourceRequirement: 'Hold the invoice until its due date.' }).candidates).toHaveLength(1);
  });

  it.each([
    'Run every Monday.',
    'Check every five minutes until complete.',
    'Send reminders every two days.',
    'Retry after ten seconds.',
    'When a new email arrives, process it.',
    'Hold this for later.',
    'Start at 9 AM each day.',
    'Poll the payment status every minute.',
    'Send reminders every two days until the form is submitted.',
    'Retry the failed request after ten seconds.',
    'The customer replied after two days.',
  ])('rejects non-Wait or unbounded wording: %s', (sourceRequirement) => {
    expect(detector.detect({ sourceRequirement }).candidates).toEqual([]);
  });

  it('keeps a vague until-boundary as a clarification without inventing a type', () => {
    const result = detector.detect({ sourceRequirement: 'Wait until ready.' });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.metadata).not.toHaveProperty('waitType');
    expect(result.ambiguities).toHaveLength(1);
    expect(result.unresolvedQuestions[0]).toMatch(/what event, response, approval, date, or duration/i);
  });

  it('preserves exact offsets and deterministic IDs without mutating input', () => {
    const input = { sourceRequirement: 'Record the request. Wait three days before following up.', businessContext: { owner: 'Sales' } };
    const before = structuredClone(input);
    const first = detector.detect(input);
    const second = detector.detect(structuredClone(input));
    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(input.sourceRequirement.slice(first.evidence[0]?.sourceStart, first.evidence[0]?.sourceEnd)).toBe(first.evidence[0]?.sourceText);
    expect(detector.supportedNodeFunctionIds).toEqual(['wait']);
  });
});

describe('ApprovalDetector', () => {
  const detector = new ApprovalDetector();

  it('detects explicit manager approval and preserves subject and approver', () => {
    const result = detector.detect({ sourceRequirement: 'Send the proposal to the manager for approval.' });
    expect(parseCapabilityDetectionResult(result)).toEqual(result);
    expect(result.candidates[0]).toMatchObject({ nodeFunctionId: 'approval', metadata: { approvalSubject: 'proposal', approverRole: 'manager' } });
    expect(result.ambiguities.some((item) => item.id.includes('outcomes'))).toBe(true);
  });

  it('detects human review and asks who reviews', () => {
    const result = detector.detect({ sourceRequirement: 'Require human review before publishing.' });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.metadata?.approvalSubject).toBe('publishing');
    expect(result.candidates[0]?.metadata).not.toHaveProperty('approverRole');
    expect(result.ambiguities.some((item) => item.id.includes('approver'))).toBe(true);
  });

  it('detects explicit approve and reject outcomes', () => {
    const result = detector.detect({ sourceRequirement: 'Wait for the client to approve or reject the design.' });
    expect(result.candidates[0]).toMatchObject({ metadata: { approvalSubject: 'design', approverRole: 'client', outcomeHints: 'Approved | Rejected' } });
    expect(result.candidates[0]?.ambiguityIds).toEqual([]);
    expect(result.candidates[0]?.relatedEntityHints.map((hint) => hint.entityType)).toEqual(['approval', 'actor', 'decision', 'route', 'route']);
  });

  it('detects a required approver decision before downstream work', () => {
    const result = detector.detect({ sourceRequirement: 'The finance director must approve the payment before processing.' });
    expect(result.candidates[0]).toMatchObject({ metadata: { approvalSubject: 'payment', approverRole: 'finance director' } });
  });

  it.each([
    'Publish approved social posts.',
    'Retrieve approved requests.',
    'Validate the invoice automatically.',
    'Notify the manager.',
    'If the payment succeeds, continue.',
  ])('rejects descriptive, automatic, notification, or system-condition wording: %s', (sourceRequirement) => {
    expect(detector.detect({ sourceRequirement }).candidates).toEqual([]);
  });

  it('preserves exact offsets and deterministic IDs without mutating input', () => {
    const input = { sourceRequirement: 'Record the draft. Send the proposal to the manager for approval.', businessContext: { team: 'Legal' } };
    const before = structuredClone(input);
    const first = detector.detect(input);
    const second = detector.detect(structuredClone(input));
    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(input.sourceRequirement.slice(first.evidence[0]?.sourceStart, first.evidence[0]?.sourceEnd)).toBe(first.evidence[0]?.sourceText);
    expect(detector.supportedNodeFunctionIds).toEqual(['approval']);
  });
});

describe('Wait and Approval detector boundaries', () => {
  it('identifies the overlap so the assembler can give Approval precedence', () => {
    const sourceRequirement = 'Wait for the client to approve or reject the design.';
    const approval = new ApprovalDetector().detect({ sourceRequirement });
    const wait = new WaitDetector().detect({ sourceRequirement });
    expect(approval.candidates).toHaveLength(1);
    expect(wait.candidates).toHaveLength(1);
    expect(approval.candidates[0]?.metadata?.scope).toBe(wait.candidates[0]?.metadata?.scope);
    expect(wait.candidates[0]?.metadata?.explicitResumeBoundary).toBe('false');
  });

  it('does not change Router or Binary Decision behavior', () => {
    expect(new RouterDetector().detect({ sourceRequirement: 'Route requests to IT, Marketing, or Customer Support.' }).candidates[0]?.nodeFunctionId).toBe('router');
    expect(new BinaryDecisionDetector().detect({ sourceRequirement: 'If payment succeeds, send a receipt; otherwise notify finance.' }).candidates[0]?.nodeFunctionId).toBe('binary-decision');
  });
});
