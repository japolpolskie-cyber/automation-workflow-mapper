import { describe, expect, it } from 'vitest';
import { workflowAnalysisResultSchema } from '@awm/shared';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { ProcessIntelligenceService } from './process-intelligence-service.js';
import { ProcessAnalysisDiagnosticsService } from './process-analysis-diagnostics.js';

const analyze = (requirements: string) => {
  const detected = new ScopeIntelligenceService().analyze(requirements, new Date('2026-07-26T00:00:00.000Z'));
  return new ProcessIntelligenceService().analyze(requirements, detected);
};

describe('ProcessAnalysisDiagnosticsService', () => {
  it('summarizes complete requirements deterministically', () => {
    const analysis = analyze('Business objective: Process purchase approvals. When an employee submits an Asana request, wait for manager approval, retry failures, loop until approved, merge results, notify finance, and complete the process when approved.');
    const service = new ProcessAnalysisDiagnosticsService();
    const first = service.create(analysis);
    const second = service.create(analysis);

    expect(first).toEqual(second);
    expect(first.businessObjective).toBe('Process purchase approvals.');
    expect(first.applicationsAndSystems).toContain('Asana');
    expect(first.summary.confidence.score).toBeGreaterThanOrEqual(50);
    expect(first.summary.coverage.detectedCategories).toBeGreaterThan(0);
  });

  it('reports incomplete requirements and applies a bounded coverage penalty', () => {
    const diagnostics = new ProcessAnalysisDiagnosticsService().create(
      analyze('When a lead arrives, notify sales. The approval owner is not specified and the system is unknown.'),
    );

    expect(diagnostics.missingInformation.length).toBeGreaterThan(0);
    expect(diagnostics.summary.coverage.missingInformationCount).toBe(diagnostics.missingInformation.length);
    expect(diagnostics.summary.coverage.score).toBeLessThanOrEqual(
      Math.round((diagnostics.summary.coverage.detectedCategories / 10) * 100),
    );
  });

  it('keeps optional concepts empty without inventing detections', () => {
    const diagnostics = new ProcessAnalysisDiagnosticsService().create(analyze('Business objective: Document an internal process.'));

    expect(diagnostics.approvals).toEqual([]);
    expect(diagnostics.waits).toEqual([]);
    expect(diagnostics.retries).toEqual([]);
    expect(diagnostics.loops).toEqual([]);
    expect(diagnostics.synchronizationSignals).toEqual([]);
  });

  it('keeps response serialization backward compatible when diagnostics are absent', () => {
    const legacy = {
      workflow: {
        schemaVersion: '2.0',
        id: '00000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000002',
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

    const parsed = workflowAnalysisResultSchema.parse(legacy);
    expect(parsed.processAnalysisDiagnostics).toBeUndefined();
  });
});
