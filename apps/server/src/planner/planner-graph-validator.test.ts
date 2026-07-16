import { describe, expect, it } from 'vitest';
import { ScopeIntelligenceService } from '../analysis/scope-intelligence.js';
import { PlannerContextBuilder } from './planner-context-builder.js';
import { validatePlannerGraph } from './planner-graph-validator.js';

const scope = 'Did the lead respond in Asana? If yes notify Slack; if no send Gmail.';
const analysis = new ScopeIntelligenceService().analyze(scope, new Date('2026-07-16T00:00:00.000Z'));
const context = new PlannerContextBuilder().build(scope, 'n8n', analysis);
const fact = context.facts.find((item) => item.kind === 'decision')!;
const evidence = context.evidence.find((item) => fact.evidenceIds.includes(item.id))!;
const node = (id: string, fn: string) => ({ id, canonicalFunctionId: fn, title: id, applicationRef: null, operationRef: null, inputs: [], outputs: [], factIds: [fact.id], patternIds: [], knowledgeIds: [], capabilityIds: [], blockedByClarificationIds: [], limitationAcknowledgements: [] });
const edge = (id: string, source: string, target: string, label: string) => ({ id, source, target, condition: label, label, purpose: 'Route work.', businessReason: 'The response changes the business path.', ruleId: 'decision.response', evidenceIds: [evidence.id] });

describe('K4.1 planner graph validation', () => {
  it('accepts explicit TRUE and FALSE binary edges', () => {
    const plan = { version: '1.1' as const, objective: scope, platform: 'n8n' as const, entryNodeId: 'condition', nodes: [node('condition', 'binary-condition'), node('yes', 'notification'), node('no', 'action')], edges: [edge('true', 'condition', 'yes', 'TRUE'), edge('false', 'condition', 'no', 'FALSE')], binaryConditions: [{ nodeId: 'condition', trueEdgeId: 'true', falseEdgeId: 'false' }], routers: [], merges: [], loops: [], retries: [], blockedByClarificationIds: context.clarifications.map((item) => item.id), warnings: [] };
    expect(validatePlannerGraph(plan, context)).toEqual([]);
  });

  it('rejects binary labels, router destinations, merge inputs, loop boundaries, and retry collisions', () => {
    const plan = { version: '1.1' as const, objective: scope, platform: 'n8n' as const, entryNodeId: 'condition', nodes: [node('condition', 'binary-condition'), node('merge', 'merge'), node('loop', 'loop')], edges: [edge('true', 'condition', 'merge', 'YES'), edge('false', 'condition', 'merge', 'NO')], binaryConditions: [{ nodeId: 'condition', trueEdgeId: 'true', falseEdgeId: 'false' }], routers: [{ nodeId: 'condition', routes: [{ label: 'A', condition: 'a', destination: 'missing', edgeId: 'true' }, { label: 'B', condition: 'b', destination: 'merge', edgeId: 'false' }] }], merges: [{ nodeId: 'merge', incomingBranches: ['true', 'missing'], mergeStrategy: 'wait_all' as const, continuationEdgeId: 'false' }], loops: [{ nodeId: 'loop', entryEdgeId: 'missing', bodyEntryNodeId: 'missing', bodyExitNodeId: 'loop', exitEdgeId: 'missing', terminationCondition: 'done' }], retries: [{ nodeId: 'loop', targetNodeId: 'condition', maximumAttempts: 3, delay: '1 minute', terminationCondition: 'success', failureEdgeId: 'missing' }], blockedByClarificationIds: [], warnings: [] };
    const codes = validatePlannerGraph(plan, context).map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(['INVALID_BINARY_LABELS', 'INVALID_ROUTE', 'INVALID_MERGE_INPUT', 'INVALID_LOOP_BOUNDARY', 'INVALID_RETRY_BOUNDARY', 'RETRY_LOOP_COLLISION']));
  });

  it('accepts separate business-loop and retry boundaries', () => {
    const nodes = [node('trigger', 'trigger'), node('loop', 'loop'), node('body', 'action'), node('retry', 'retry'), node('end', 'end')];
    const edges = [edge('entry', 'trigger', 'loop', 'NEXT'), edge('body', 'loop', 'body', 'CONTINUE'), edge('back', 'body', 'loop', 'REPEAT'), edge('exit', 'loop', 'retry', 'EXIT'), edge('failure', 'retry', 'end', 'FAILED')];
    const plan = { version: '1.1' as const, objective: scope, platform: 'n8n' as const, entryNodeId: 'trigger', nodes, edges, binaryConditions: [], routers: [], merges: [], loops: [{ nodeId: 'loop', entryEdgeId: 'entry', bodyEntryNodeId: 'body', bodyExitNodeId: 'body', exitEdgeId: 'exit', terminationCondition: 'customer responded or attempt limit reached' }], retries: [{ nodeId: 'retry', targetNodeId: 'body', maximumAttempts: 3, delay: '1 minute', terminationCondition: 'upload succeeds or attempts exhausted', failureEdgeId: 'failure' }], blockedByClarificationIds: [], warnings: [] };
    expect(validatePlannerGraph(plan, context)).toEqual([]);
  });
});
