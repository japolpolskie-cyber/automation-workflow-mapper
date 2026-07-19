import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { V21AnalysisService } from './v2-analysis-service.js';

describe('V2.1 shadow analysis service', () => {
  it('normalizes requirement concepts without creating a competing workflow graph', () => {
    const scope = 'Objective: Qualify leads. When a form is submitted, for every lead validate the record. If approved then notify sales else stop the process. Retry the API 3 times with exponential backoff.';
    const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-19T00:00:00.000Z'));
    const result = new V21AnalysisService().analyze(scope, analysis);
    expect(result).toMatchObject({ version: '2.1', shadowMode: true });
    expect(result.requirementAnalysis.objective).toBe('Qualify leads.');
    expect(result.requirementAnalysis.trigger?.value).toMatch(/form is submitted/i);
    expect(result.requirementAnalysis.entities.some((item) => item.value === 'lead')).toBe(true);
    expect(result.controlFlow.map((item) => item.type)).toEqual(expect.arrayContaining(['iterator', 'binary-decision', 'retry', 'termination']));
    expect(result).not.toHaveProperty('nodes');
    expect(result).not.toHaveProperty('edges');
  });
});
