import type { CanonicalFunctionId } from './types.js';

export const KNOWLEDGE_RULE_VERSION = '1.0.0' as const;

export interface WorkflowPatternDefinition {
  id: string;
  title: string;
  purpose: string;
  requiredSignals: string[];
  canonicalFunctions: CanonicalFunctionId[];
  requiredClarifications: string[];
  version: typeof KNOWLEDGE_RULE_VERSION;
}

export const workflowPatterns: readonly WorkflowPatternDefinition[] = [
  { id: 'follow-up-until-response', title: 'Follow Up Until Response', purpose: 'Repeat a message and response check until a bounded stop condition is met.', requiredSignals: ['follow up', 'response'], canonicalFunctions: ['action', 'delay', 'data-retrieval', 'binary-condition', 'loop'], requiredClarifications: ['follow-up interval', 'maximum attempts', 'escalation policy', 'communication channel'], version: KNOWLEDGE_RULE_VERSION },
  { id: 'create-or-update-record', title: 'Create or Update Record', purpose: 'Find a record by a stable key, then create or update without duplication.', requiredSignals: ['create', 'update'], canonicalFunctions: ['data-retrieval', 'binary-condition', 'action', 'merge'], requiredClarifications: ['duplicate-handling policy'], version: KNOWLEDGE_RULE_VERSION },
  { id: 'process-approved-collection', title: 'Process Approved Collection', purpose: 'Process each item in a collection after explicit approval.', requiredSignals: ['approval', 'collection'], canonicalFunctions: ['human-approval', 'iterator', 'action', 'aggregator'], requiredClarifications: ['approval owner'], version: KNOWLEDGE_RULE_VERSION },
  { id: 'scheduled-reminder', title: 'Scheduled Reminder', purpose: 'Send a reminder at a stated time or recurring schedule.', requiredSignals: ['reminder', 'schedule'], canonicalFunctions: ['trigger', 'delay', 'notification'], requiredClarifications: ['reminder interval'], version: KNOWLEDGE_RULE_VERSION },
  { id: 'deduplicate-before-create', title: 'Deduplicate Before Create', purpose: 'Search for an existing item before creating a new one.', requiredSignals: ['search', 'create'], canonicalFunctions: ['data-retrieval', 'binary-condition', 'action'], requiredClarifications: ['duplicate-handling policy'], version: KNOWLEDGE_RULE_VERSION },
  { id: 'service-based-routing', title: 'Service-Based Routing', purpose: 'Route work to one of several paths based on service type.', requiredSignals: ['service', 'route'], canonicalFunctions: ['multi-route-decision', 'action', 'merge'], requiredClarifications: [], version: KNOWLEDGE_RULE_VERSION },
] as const;

export interface RuleManualDefinition {
  id: string;
  title: string;
  ruleCategory: string;
  guidance: string;
  version: typeof KNOWLEDGE_RULE_VERSION;
}

export const ruleManuals: readonly RuleManualDefinition[] = [
  { id: 'iterator-manual', title: 'Iterator Manual', ruleCategory: 'cardinality', guidance: 'Use an iterator only when explicit or strongly supported collection evidence exists. A single record must not imply iteration.', version: KNOWLEDGE_RULE_VERSION },
  { id: 'binary-condition-manual', title: 'Binary Condition Manual', ruleCategory: 'decision', guidance: 'Use for exactly two meaningful outcomes. A visible false-path action requires a binary condition rather than a filter.', version: KNOWLEDGE_RULE_VERSION },
  { id: 'multi-route-manual', title: 'Multi-Route Decision Manual', ruleCategory: 'routing', guidance: 'Use when business work selects among three or more named routes.', version: KNOWLEDGE_RULE_VERSION },
  { id: 'clarification-manual', title: 'Clarification Manual', ruleCategory: 'uncertainty', guidance: 'Missing business policy is surfaced as a clarification and is never silently assumed.', version: KNOWLEDGE_RULE_VERSION },
] as const;
