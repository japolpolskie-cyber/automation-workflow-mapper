import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { ProcessIntelligenceService } from './process-intelligence-service.js';

describe('ProcessIntelligenceService', () => {
  it('produces typed planning inputs for the supported process concepts', () => {
    const requirements = `
      Business objective: Approve qualified purchase requests.
      When an employee submits a request in Asana, notify the finance manager.
      Wait for approval callback, retry the accounting API, and loop until approved.
      Merge the approval results and complete the process when approved.
    `;
    const detected = new ScopeIntelligenceService().analyze(requirements, new Date('2026-07-26T00:00:00.000Z'));
    const result = new ProcessIntelligenceService().analyze(requirements, detected);

    expect(result.version).toBe('1.0');
    expect(result.originalRequirements).toBe(requirements);
    expect(result.normalizedRequirements).not.toContain('      ');
    expect(result.businessObjective).toBe('Approve qualified purchase requests.');
    expect(result.actors.map((item) => item.value.toLowerCase())).toEqual(expect.arrayContaining(['employee', 'finance']));
    expect(result.externalSystems.map((item) => item.value.toLowerCase())).toContain('asana');
    expect(result.triggers[0]?.value).toMatch(/employee submits a request/i);
    expect(result.waits.some((item) => item.kind === 'event')).toBe(true);
    expect(result.retries.length).toBeGreaterThan(0);
    expect(result.loops.length).toBeGreaterThan(0);
    expect(result.semanticAnalysis.shadowMode).toBe(true);
  });

  it('distinguishes duration waits and exposes missing information', () => {
    const requirements = 'When a lead arrives, wait five minutes and notify sales. The approval owner is not specified.';
    const detected = new ScopeIntelligenceService().analyze(requirements, new Date('2026-07-26T00:00:00.000Z'));
    const result = new ProcessIntelligenceService().analyze(requirements, detected);

    expect(result.waits.some((item) => item.kind === 'duration')).toBe(true);
    expect(result.missingInformation.length).toBeGreaterThan(0);
  });
});
