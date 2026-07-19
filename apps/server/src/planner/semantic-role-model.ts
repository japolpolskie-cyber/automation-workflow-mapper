import type { PlannerContext, PlannerDataShape, PlannerSemanticRole, SemanticRoleSlot } from '@awm/shared';
import type { PlannerSymbolTable } from './controlled-vocabulary.js';

export interface SemanticRoleDefinition {
  role: PlannerSemanticRole;
  allowedCanonicalFunctions: string[];
  inputShape: PlannerDataShape[];
  outputShape: PlannerDataShape[];
  minimumIncomingEdges: number;
  expectedOutgoingEdges: string;
  allowedEdgeRoles: string[];
  forbiddenNeighbors: PlannerSemanticRole[];
  requiredClarificationCategories: string[];
  compatiblePatterns: string[];
  compatibleCardinality: PlannerDataShape[];
  mayTerminate: boolean;
}

const role = (
  roleName: PlannerSemanticRole, functions: string[], input: PlannerDataShape[], output: PlannerDataShape[],
  minimumIncomingEdges: number, expectedOutgoingEdges: string, allowedEdgeRoles: string[], mayTerminate = false,
  extras: Partial<SemanticRoleDefinition> = {},
): SemanticRoleDefinition => ({
  role: roleName, allowedCanonicalFunctions: functions, inputShape: input, outputShape: output,
  minimumIncomingEdges, expectedOutgoingEdges, allowedEdgeRoles, mayTerminate,
  forbiddenNeighbors: [], requiredClarificationCategories: [], compatiblePatterns: [],
  compatibleCardinality: input, ...extras,
});

export const semanticRoleDefinitions: Readonly<Record<PlannerSemanticRole, SemanticRoleDefinition>> = {
  'workflow-trigger': role('workflow-trigger', ['trigger'], ['none'], ['single', 'collection', 'unknown'], 0, 'exactly one', ['flow']),
  'data-retrieval': role('data-retrieval', ['data-retrieval'], ['single', 'unknown'], ['single', 'collection'], 1, 'one', ['flow']),
  'data-transformation': role('data-transformation', ['data-transformation', 'action'], ['single', 'collection', 'unknown'], ['single', 'collection', 'unknown'], 1, 'one', ['flow']),
  'validation-gate': role('validation-gate', ['validation', 'filter'], ['single', 'collection'], ['single', 'collection'], 1, 'zero or one', ['flow']),
  'binary-decision': role('binary-decision', ['binary-condition'], ['single', 'unknown'], ['branches'], 1, 'exactly TRUE and FALSE', ['true', 'false'], false, { requiredClarificationCategories: ['condition'] }),
  'multi-route-decision': role('multi-route-decision', ['multi-route-decision'], ['single', 'unknown'], ['branches'], 1, 'at least three routes', ['route', 'fallback']),
  'collection-iterator': role('collection-iterator', ['iterator'], ['collection'], ['single'], 1, 'body and completion', ['loop-entry', 'loop-exit']),
  'business-loop': role('business-loop', ['loop'], ['single', 'unknown'], ['single', 'unknown'], 1, 'body, loop-back and exit', ['loop-entry', 'loop-back', 'loop-exit'], false, { compatiblePatterns: ['follow-up-until-response'], requiredClarificationCategories: ['timing', 'repetition', 'escalation', 'channel'] }),
  'technical-retry': role('technical-retry', ['retry'], ['single', 'unknown'], ['single', 'unknown'], 1, 'retry and exhausted', ['retry', 'retry-exhausted'], false, { forbiddenNeighbors: ['business-loop'], requiredClarificationCategories: ['repetition'] }),
  'branch-merge': role('branch-merge', ['merge'], ['branches'], ['single', 'unknown'], 2, 'one continuation', ['continuation']),
  'item-aggregator': role('item-aggregator', ['aggregator'], ['item-results'], ['single', 'collection'], 1, 'one continuation', ['continuation']),
  'delay-boundary': role('delay-boundary', ['delay'], ['single', 'unknown'], ['single', 'unknown'], 1, 'one', ['flow'], false, { requiredClarificationCategories: ['timing'] }),
  notification: role('notification', ['notification', 'action'], ['single', 'unknown'], ['single', 'unknown'], 1, 'zero or one', ['flow'], false, { requiredClarificationCategories: ['channel'] }),
  logging: role('logging', ['logging', 'action'], ['single', 'collection', 'unknown'], ['single', 'collection', 'unknown'], 1, 'zero or one', ['flow']),
  'manual-review': role('manual-review', ['manual-review', 'human-approval'], ['single', 'unknown'], ['single', 'branches'], 1, 'one or decision outcomes', ['flow', 'true', 'false'], false, { requiredClarificationCategories: ['approval'] }),
  'successful-end': role('successful-end', ['end'], ['single', 'unknown'], ['none'], 1, 'none', [], true),
  'blocked-end': role('blocked-end', ['end'], ['single', 'unknown'], ['none'], 1, 'none', [], true),
  'escalation-end': role('escalation-end', ['end', 'notification'], ['single', 'unknown'], ['none'], 1, 'none', [], true),
  'parallel-split': role('parallel-split', ['multi-route-decision'], ['single', 'unknown'], ['branches'], 1, 'at least two parallel branches', ['parallel-branch']),
  'conditional-parallel-routing': role('conditional-parallel-routing', ['multi-route-decision'], ['single', 'unknown'], ['branches'], 1, 'at least two non-exclusive branches', ['conditional-branch']),
  'merge-all': role('merge-all', ['merge'], ['branches'], ['single', 'unknown'], 2, 'one continuation after all inputs', ['continuation']),
  'merge-any': role('merge-any', ['merge'], ['branches'], ['single', 'unknown'], 2, 'one continuation after a qualifying input', ['continuation']),
  'human-review': role('human-review', ['manual-review'], ['single', 'unknown'], ['branches', 'single'], 1, 'wait for a human response', ['continuation'], false, { requiredClarificationCategories: ['approval'] }),
  approval: role('approval', ['human-approval'], ['single', 'unknown'], ['branches', 'single'], 1, 'wait for approval outcomes', ['continuation', 'approved', 'rejected'], false, { requiredClarificationCategories: ['approval'] }),
  'event-wait': role('event-wait', ['delay'], ['single', 'unknown'], ['single', 'unknown'], 1, 'resume or timeout', ['resume', 'timeout']),
  'resume-point': role('resume-point', ['data-transformation'], ['single', 'unknown'], ['single', 'unknown'], 1, 'one continuation', ['continuation', 'resume']),
  'loop-until': role('loop-until', ['loop'], ['single', 'unknown'], ['single', 'unknown'], 1, 'body, loop-back and exit', ['loop-entry', 'loop-back', 'loop-exit']),
  'error-handler': role('error-handler', ['error-handler'], ['single', 'unknown'], ['single', 'unknown'], 1, 'handled or terminal', ['handled', 'continuation', 'flow']),
  'sub-workflow': role('sub-workflow', ['sub-workflow'], ['single', 'collection', 'unknown'], ['single', 'collection', 'unknown'], 1, 'one sub-workflow return', ['subworkflow-return']),
  'meaningful-end': role('meaningful-end', ['end'], ['single', 'unknown'], ['none'], 1, 'none', [], true),
};

const hasFact = (context: PlannerContext, value: string) => context.facts.some((fact) => fact.value === value);
const hasPattern = (context: PlannerContext, id: string) => context.patterns.some((pattern) => pattern.id === id);
const cardinality = (context: PlannerContext): PlannerDataShape =>
  context.facts.some((fact) => fact.kind === 'cardinality' && fact.value === 'collection') ? 'collection' :
  context.facts.some((fact) => fact.kind === 'cardinality' && fact.value === 'single') ? 'single' : 'unknown';

export function deriveSemanticRoleSlots(context: PlannerContext, table: PlannerSymbolTable): SemanticRoleSlot[] {
  const selected = new Set<PlannerSemanticRole>(['workflow-trigger', 'data-transformation', 'successful-end']);
  if (hasFact(context, 'binary-condition')) selected.add('binary-decision');
  if (hasFact(context, 'multi-route-decision')) selected.add('multi-route-decision');
  if (cardinality(context) === 'collection') selected.add('collection-iterator');
  if (hasPattern(context, 'follow-up-until-response')) { selected.add('business-loop'); selected.add('delay-boundary'); }
  if (hasPattern(context, 'create-or-update-record') || hasPattern(context, 'service-based-routing')) selected.add('branch-merge');
  for (const functionId of context.allowedCanonicalFunctions) {
    for (const matching of Object.values(semanticRoleDefinitions).filter((definition) => definition.allowedCanonicalFunctions.includes(functionId))) selected.add(matching.role);
  }
  return [...selected].flatMap((roleName, index) => {
    const definition = semanticRoleDefinitions[roleName];
    const allowed = definition.allowedCanonicalFunctions.filter((id) => context.allowedCanonicalFunctions.includes(id));
    if (!allowed.length) return [];
    return [{
      slotId: `role-slot-${index + 1}`,
      role: roleName,
      allowedCanonicalFunctionSymbols: allowed.map((id) => table.symbol('canonical-function', id)),
      inputShape: definition.inputShape.includes(cardinality(context)) ? cardinality(context) : definition.inputShape[0]!,
      outputShape: definition.outputShape[0]!,
      factSymbols: context.facts.filter((fact) => definition.allowedCanonicalFunctions.includes(fact.value)).map((fact) => table.symbol('fact', fact.id)),
      clarificationSymbols: context.clarifications.filter((item) => definition.requiredClarificationCategories.includes(item.category)).map((item) => table.symbol('clarification', item.id)),
      patternSymbols: context.patterns.filter((item) => definition.compatiblePatterns.includes(item.id)).map((item) => table.symbol('pattern', item.id)),
      reason: `Software assigned ${roleName} from deterministic facts, patterns, and entity cardinality.`,
    }];
  });
}
