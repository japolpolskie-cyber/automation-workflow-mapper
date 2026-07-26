import { describe, expect, it } from 'vitest';
import { workflowAnalysisResultSchema, type ProcessAnalysis } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { ProcessIntelligenceService } from './process-intelligence-service.js';
import { ProcessAnalysisDiagnosticsService } from './process-analysis-diagnostics.js';
import { ClarificationReadinessService } from './clarification-readiness-service.js';

const prepare = (requirements: string) => {
  const detected = new ScopeIntelligenceService().analyze(requirements, new Date('2026-07-26T00:00:00.000Z'));
  const analysis = new ProcessIntelligenceService().analyze(requirements, detected);
  const diagnostics = new ProcessAnalysisDiagnosticsService().create(analysis);
  return { analysis, diagnostics };
};

describe('ClarificationReadinessService', () => {
  it('creates ordered recommendations for incomplete requirements with traceability', () => {
    const { analysis, diagnostics } = prepare('Process incoming requests. The approval owner is not specified and the system is unknown.');
    const result = new ClarificationReadinessService().create(analysis, diagnostics);

    expect(result.map((item) => item.importance)).toEqual([...result.map((item) => item.importance)].sort((a, b) => ({ required: 0, recommended: 1, optional: 2 }[a] - { required: 0, recommended: 1, optional: 2 }[b])));
    expect(result.map((item) => item.category)).toEqual(expect.arrayContaining(['trigger', 'actor-owner', 'application-system']));
    expect(result.find((item) => item.category === 'actor-owner')?.sourceRequirementIds.length).toBeGreaterThan(0);
  });

  it('creates none or only optional recommendations for complete requirements', () => {
    const { analysis, diagnostics } = prepare('Business objective: Approve invoices. When an invoice arrives in Asana, the finance manager approves it within two days. Retry the API up to 3 attempts, handle final failure by notifying operations, and complete the process when approved.');
    const result = new ClarificationReadinessService().create(analysis, diagnostics);

    expect(result.every((item) => item.importance === 'optional')).toBe(true);
  });

  it('uses deterministic ids, ordering, and semantic-category deduplication', () => {
    const prepared = prepare('Process requests. The approval owner is not specified.');
    const duplicate: ProcessAnalysis = {
      ...prepared.analysis,
      missingInformation: [
        ...prepared.analysis.missingInformation,
        ...prepared.analysis.missingInformation,
      ],
    };
    const diagnostics = new ProcessAnalysisDiagnosticsService().create(duplicate);
    const service = new ClarificationReadinessService();
    const first = service.create(duplicate, diagnostics);
    const second = service.create(duplicate, diagnostics);

    expect(first).toEqual(second);
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
    expect(first.filter((item) => item.category === 'actor-owner')).toHaveLength(1);
  });

  it('keeps legacy analysis responses valid without recommendations', () => {
    const legacy = {
      workflow: {
        schemaVersion: '2.0',
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Legacy workflow',
        summary: 'Legacy workflow',
        targetPlatform: 'n8n',
        confidence: 1,
        complexity: 'simple',
        nodes: [],
        connections: [],
        branches: [],
        credentials: [],
        clarifications: [],
        assumptions: [],
        risks: [],
        warnings: [],
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
      },
      graphValidation: { valid: true, errorCount: 0, warningCount: 0 },
      provider: 'local',
      analyzedAt: '2026-07-26T00:00:00.000Z',
    };

    expect(workflowAnalysisResultSchema.parse(legacy).clarificationRecommendations).toBeUndefined();
  });
});
