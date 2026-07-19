import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { LifecycleCapabilityGrouper } from './lifecycle-capability-grouper.js';
import { RequirementAnalysisNormalizer } from './requirement-analysis-normalizer.js';

const group = (scope: string) => {
  const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z'));
  const normalized = new RequirementAnalysisNormalizer().normalize(scope, analysis);
  return new LifecycleCapabilityGrouper().group(analysis, normalized);
};

describe('V2.1 lifecycle capability grouping', () => {
  it('groups related operations into one traceable business capability', () => {
    const groups = group('1. Search the lead, update the lead record, save the lead source ID, and notify the owner.');
    const leadGroup = groups.find((item) => item.entity === 'lead');
    expect(leadGroup?.underlyingOperations.length).toBeGreaterThan(1);
    expect(leadGroup?.rationale).toMatch(/Grouped/);
    expect(leadGroup?.operationFactIds.length).toBeGreaterThan(1);
  });

  it('does not merge unrelated operations from separate requirement steps', () => {
    const groups = group('1. Create a customer record.\n2. Upload an invoice file.');
    const customer = groups.find((item) => item.entity === 'customer');
    const invoice = groups.find((item) => item.entity === 'invoice');
    expect(customer).toBeDefined();
    expect(invoice).toBeDefined();
    expect(customer?.id).not.toBe(invoice?.id);
  });

  it('preserves every source requirement reference and underlying operation', () => {
    const groups = group('1. Find the contact and update the contact.');
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((item) => item.sourceReferences.length > 0 && item.underlyingOperations.every((operation) => operation.sourceReference.text.length > 0))).toBe(true);
  });
});
