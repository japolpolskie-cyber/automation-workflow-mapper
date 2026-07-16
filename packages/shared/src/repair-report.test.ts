import { describe, expect, it } from 'vitest';
import { repairReportSchema } from './repair-report.js';

describe('RepairReport contract', () => {
  it('supports a transparent no-repair report', () => {
    const report = repairReportSchema.parse({ version: '1.0', workflowId: '00000000-0000-4000-8000-000000000001', attempt: 0, maximumAttempts: 2, actions: [], unresolvedIssueCodes: [], validBefore: true, validAfter: true, createdAt: '2026-07-16T00:00:00.000Z' });
    expect(report.actions).toEqual([]);
  });

  it('rejects attempts beyond the configured repair boundary', () => {
    expect(repairReportSchema.safeParse({ version: '1.0', workflowId: '00000000-0000-4000-8000-000000000001', attempt: 3, maximumAttempts: 2, validBefore: false, validAfter: false, createdAt: '2026-07-16T00:00:00.000Z' }).success).toBe(false);
  });
});
