import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { PlannerPromptBuilder } from './planner-prompt-builder.js';
import { k42LiveScenarios } from './k4-2-live-benchmark.test.js';

describe('K4.2 deterministic prompt benchmark', () => {
  it('reports compact prompt sections for the six live scopes', () => {
    const intelligence = new ScopeIntelligenceService();
    const contextBuilder = new PlannerContextBuilder();
    const promptBuilder = new PlannerPromptBuilder();
    const results = k42LiveScenarios.map((scenario) => {
      const analysis = intelligence.analyze(scenario.scope, new Date('2026-07-16T00:00:00.000Z'));
      const prompt = promptBuilder.build(contextBuilder.build(scenario.scope, scenario.platform, analysis));
      return { name: scenario.name, characters: prompt.characterCount, estimatedTokens: Math.ceil(prompt.characterCount / 4), sections: prompt.sectionCharacterCounts };
    });
    console.log(`K4_2_PROMPT_RESULTS=${JSON.stringify(results)}`);
    expect(results.every((item) => item.characters <= 24_000)).toBe(true);
  });
});
