import type { Platform } from '@awm/shared';
import type { CanonicalFunctionId } from './types.js';

export interface PlatformNodeKnowledge {
  id: string;
  platform: Platform;
  name: string;
  kind: 'node' | 'module' | 'step' | 'application';
  canonicalFunctionId: CanonicalFunctionId;
  description: string;
  useWhen: string;
  doNotUseWhen: string;
  matchTerms: string[];
  exclusiveGroup: string | null;
  verification: 'verified' | 'catalog_seed';
}

const entry = (
  platform: Platform,
  id: string,
  name: string,
  kind: PlatformNodeKnowledge['kind'],
  canonicalFunctionId: CanonicalFunctionId,
  description: string,
  useWhen: string,
  doNotUseWhen: string,
  matchTerms: string[],
  exclusiveGroup: string | null = null,
): PlatformNodeKnowledge => ({
  id: `${platform}.${id}`, platform, name, kind, canonicalFunctionId, description,
  useWhen, doNotUseWhen, matchTerms, exclusiveGroup, verification: 'catalog_seed',
});

const n8n: PlatformNodeKnowledge[] = [
  entry('n8n', 'webhook', 'Webhook', 'node', 'trigger', 'Receives an inbound HTTP request and starts the workflow.', 'The scope explicitly names an incoming webhook or HTTP callback.', 'Do not use when no inbound event is stated.', ['webhook', 'http request', 'callback'], 'entry'),
  entry('n8n', 'schedule-trigger', 'Schedule Trigger', 'node', 'trigger', 'Starts a workflow on a configured schedule.', 'A recurring time, day, or interval starts the process.', 'Do not use for a one-time delay inside a running workflow.', ['schedule', 'every day', 'daily', 'weekly', 'monthly'], 'entry'),
  entry('n8n', 'if', 'IF', 'node', 'binary-condition', 'Creates exactly two meaningful outputs for a binary decision.', 'The business decision has two active outcomes such as approved and rejected.', 'Do not use for three or more routes or when unmatched items simply stop.', ['if', 'true', 'false', 'approved', 'rejected', 'yes', 'no'], 'decision'),
  entry('n8n', 'switch', 'Switch', 'node', 'multi-route-decision', 'Routes items across three or more named outcomes.', 'The scope names multiple categories, statuses, priorities, or destinations.', 'Do not use for an exactly binary decision.', ['route by', 'based on status', 'based on category', 'based on priority', 'switch'], 'decision'),
  entry('n8n', 'split-out', 'Split Out', 'node', 'iterator', 'Turns an array field into individual n8n items.', 'A collection field such as attachments must be processed one item at a time.', 'Do not use for one record or for explicit batch-size control.', ['each attachment', 'each item', 'every item', 'split array', 'attachments'], 'collection-expansion'),
  entry('n8n', 'loop-over-items', 'Loop Over Items', 'node', 'iterator', 'Processes input items in controlled batches and exposes loop and done boundaries.', 'The scope requires batching, one-at-a-time control, or explicit iteration boundaries.', 'Do not use merely to split one array field; prefer Split Out.', ['batch', 'batch size', 'one at a time', 'loop over items'], 'collection-expansion'),
  entry('n8n', 'aggregate', 'Aggregate', 'node', 'aggregator', 'Combines multiple item results into one summarized output.', 'Downstream work needs one combined collection or summary.', 'Do not use before a collection-producing step.', ['aggregate', 'combine results', 'summarize results', 'consolidate results']),
  entry('n8n', 'merge', 'Merge', 'node', 'merge', 'Rejoins two or more execution branches.', 'Separate branches must converge before a shared continuation.', 'Do not use for combining item values; use Aggregate.', ['merge branches', 'rejoin', 'converge']),
  entry('n8n', 'wait', 'Wait', 'node', 'delay', 'Pauses execution for a duration, time, or resume event.', 'The scope explicitly states when or how long to wait.', 'Do not invent timing.', ['wait', 'delay', 'after a period', 'until']),
  entry('n8n', 'filter', 'Filter', 'node', 'filter', 'Keeps matching items and silently drops unmatched items.', 'Unmatched records require no visible action.', 'Use IF when the false outcome performs business work.', ['filter', 'continue only', 'discard unmatched']),
  entry('n8n', 'http-request', 'HTTP Request', 'node', 'action', 'Calls a REST endpoint using an explicitly supplied API requirement.', 'A verified native application operation is unavailable and the scope names an API.', 'Do not invent endpoints, methods, headers, or payloads.', ['external api', 'rest api', 'http request', 'api call']),
  entry('n8n', 'edit-fields', 'Edit Fields', 'node', 'data-transformation', 'Adds, renames, removes, or maps fields without external side effects.', 'Downstream inputs require field mapping or normalization.', 'Do not hide business decisions in field transformations.', ['map fields', 'rename fields', 'edit fields', 'normalize data']),
  entry('n8n', 'code', 'Code', 'node', 'data-transformation', 'Runs JavaScript or Python for transformations unsupported by simpler nodes.', 'The scope explicitly requires custom code or a non-trivial calculation.', 'Do not use as a generic substitute for supported nodes.', ['function', 'javascript', 'python', 'custom code', 'calculate score']),
  entry('n8n', 'error-trigger', 'Error Trigger', 'node', 'error-handler', 'Starts a separate recovery workflow when another workflow fails.', 'The requirements explicitly request workflow-level failure monitoring.', 'Do not create it for ordinary business false paths.', ['error workflow', 'workflow fails', 'failure monitoring']),
];

const make: PlatformNodeKnowledge[] = [
  entry('make', 'custom-webhook', 'Custom Webhook', 'module', 'trigger', 'Receives an inbound HTTP request as an instant scenario trigger.', 'The scope explicitly names an incoming webhook.', 'Do not invent a webhook for a procedural scope.', ['webhook', 'incoming http', 'callback'], 'entry'),
  entry('make', 'scheduler', 'Scheduler', 'module', 'trigger', 'Starts a scenario according to a configured schedule.', 'A recurring schedule starts the automation.', 'Do not use for a delay within an active scenario.', ['schedule', 'daily', 'weekly', 'monthly', 'every day'], 'entry'),
  entry('make', 'router', 'Router', 'module', 'multi-route-decision', 'Splits execution into multiple routes governed by route filters.', 'The business process has multiple named destinations or outcomes.', 'A Router does not iterate an array.', ['route by', 'route records', 'multiple routes', 'by status', 'based on status', 'based on category', 'router'], 'decision'),
  entry('make', 'binary-router', 'Router with two filters', 'module', 'binary-condition', 'Represents a binary decision using two mutually exclusive filtered routes.', 'Exactly two meaningful outcomes both perform work.', 'Do not use a single Filter when the false outcome has work.', ['if', 'approved', 'rejected', 'true', 'false', 'yes', 'no'], 'decision'),
  entry('make', 'filter', 'Route Filter', 'module', 'filter', 'Allows matching bundles to continue on a route.', 'Unmatched bundles stop without a visible alternate action.', 'Use a Router when another outcome needs work.', ['filter', 'continue only', 'only when']),
  entry('make', 'iterator', 'Iterator', 'module', 'iterator', 'Converts an array into separate bundles, one per array item.', 'Each item in an explicit array or collection needs downstream processing.', 'Do not use Router, Text Parser, or Aggregator as an iterator.', ['each attachment', 'each item', 'every item', 'array items', 'iterator'], 'collection-expansion'),
  entry('make', 'array-aggregator', 'Array Aggregator', 'module', 'aggregator', 'Combines bundles from a source module into one array.', 'Several processed bundles must become one collection.', 'Do not use to split or route data.', ['aggregate', 'combine results', 'one array', 'array aggregator']),
  entry('make', 'text-aggregator', 'Text Aggregator', 'module', 'aggregator', 'Combines multiple bundle values into one text output.', 'The desired output is one composed text body.', 'Do not use for structured arrays.', ['combine text', 'text summary', 'text aggregator']),
  entry('make', 'sleep', 'Sleep', 'module', 'delay', 'Pauses a scenario route for an explicit duration.', 'The requirements state a duration before the next action.', 'Do not invent timing or use it as approval storage.', ['wait', 'sleep', 'delay', 'after a period']),
  entry('make', 'text-parser', 'Text Parser', 'module', 'data-transformation', 'Extracts or transforms text using parsing rules.', 'Unstructured text must be parsed into fields.', 'It does not iterate arrays and does not create conditional routes.', ['parse text', 'extract from text', 'text parser']),
  entry('make', 'parse-json', 'Parse JSON', 'module', 'data-transformation', 'Converts a JSON string into structured fields.', 'A source provides JSON text that needs structured mapping.', 'Do not add when the source already outputs structured bundles.', ['parse json', 'json string']),
  entry('make', 'http-request', 'HTTP — Make a Request', 'module', 'action', 'Calls an explicitly required HTTP API.', 'The scope identifies an API and no verified native operation is selected.', 'Do not invent endpoints, authentication, or payloads.', ['external api', 'rest api', 'http request', 'api call']),
  entry('make', 'error-handler', 'Error Handler Route', 'module', 'error-handler', 'Handles technical module failures through an explicit error route.', 'The scope requires retry, rollback, resume, or failure notification.', 'Do not model normal business outcomes as errors.', ['error handling', 'api failure', 'rollback', 'retry failure']),
];

const zapier: PlatformNodeKnowledge[] = [
  entry('zapier', 'webhooks-catch-hook', 'Webhooks by Zapier — Catch Hook', 'step', 'trigger', 'Receives an inbound webhook and starts a Zap.', 'The scope explicitly names an incoming webhook.', 'Do not invent a webhook when an application trigger is specified.', ['webhook', 'catch hook', 'incoming http'], 'entry'),
  entry('zapier', 'schedule', 'Schedule by Zapier', 'step', 'trigger', 'Starts a Zap on a configured recurring schedule.', 'A recurring time or interval starts the workflow.', 'Do not use for an in-workflow wait.', ['schedule', 'daily', 'weekly', 'monthly', 'every day'], 'entry'),
  entry('zapier', 'paths', 'Paths by Zapier', 'step', 'multi-route-decision', 'Creates multiple conditional paths with distinct downstream actions.', 'The scope requires multiple named outcomes or destinations.', 'Do not use for collection iteration.', ['route by', 'multiple paths', 'based on status', 'based on category', 'paths'], 'decision'),
  entry('zapier', 'binary-paths', 'Paths by Zapier — Two Paths', 'step', 'binary-condition', 'Represents two meaningful business outcomes as separate paths.', 'Both yes/no or approve/reject outcomes require actions.', 'Use Filter when unmatched data should simply stop.', ['if', 'approved', 'rejected', 'true', 'false', 'yes', 'no'], 'decision'),
  entry('zapier', 'filter', 'Filter by Zapier', 'step', 'filter', 'Continues only when configured conditions match.', 'Unmatched records should stop without alternate work.', 'Do not use when the false outcome needs an action.', ['filter', 'continue only', 'only if']),
  entry('zapier', 'looping-line-items', 'Looping by Zapier — Create Loop From Line Items', 'step', 'iterator', 'Runs downstream actions once for each supplied line item.', 'An explicit collection or line-item list requires per-item work.', 'Formatter and Parser are not collection iterators.', ['each attachment', 'each item', 'every item', 'each line item', 'line item', 'line items', 'looping'], 'collection-expansion'),
  entry('zapier', 'formatter', 'Formatter by Zapier', 'step', 'data-transformation', 'Transforms text, numbers, dates, and utility values.', 'Values require supported formatting before a later action.', 'It does not iterate a collection or create branches.', ['format text', 'format date', 'transform value', 'formatter']),
  entry('zapier', 'digest', 'Digest by Zapier', 'step', 'aggregator', 'Collects items over time and releases them together.', 'The process explicitly needs a digest or accumulated summary.', 'Do not use for immediate arbitrary branch merging.', ['digest', 'collect items', 'send together', 'daily summary']),
  entry('zapier', 'delay', 'Delay by Zapier', 'step', 'delay', 'Delays subsequent Zap actions for an explicit duration or until a time.', 'The scope provides an explicit wait requirement.', 'Do not invent timing.', ['wait', 'delay', 'later', 'until']),
  entry('zapier', 'webhooks-request', 'Webhooks by Zapier — Custom Request', 'step', 'action', 'Calls an explicitly required HTTP endpoint.', 'A verified native action is unavailable and the scope identifies an API.', 'Do not invent request details.', ['external api', 'rest api', 'custom request', 'api call']),
  entry('zapier', 'sub-zap', 'Sub-Zap', 'step', 'action', 'Calls a reusable child Zap.', 'The scope explicitly requests a reusable sub-process.', 'Do not introduce it solely to shorten the visible workflow.', ['sub-zap', 'child workflow', 'reusable workflow']),
];

export const platformNodeKnowledge: readonly PlatformNodeKnowledge[] = [...n8n, ...make, ...zapier];

const normalizedTerms = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const containsTerm = (text: string, term: string) => ` ${text} `.includes(` ${term} `);

export function retrievePlatformNodeKnowledge(platform: Platform, scope: string, limit = 12): readonly PlatformNodeKnowledge[] {
  const normalizedScope = normalizedTerms(scope);
  const candidates = platformNodeKnowledge
    .filter((item) => item.platform === platform)
    .map((item) => {
      const matches = item.matchTerms.filter((term) => containsTerm(normalizedScope, normalizedTerms(term)));
      const exactName = containsTerm(normalizedScope, normalizedTerms(item.name));
      return { item, score: matches.length * 3 + (exactName ? 5 : 0) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

  const selected: PlatformNodeKnowledge[] = [];
  const exclusiveGroups = new Set<string>();
  for (const { item } of candidates) {
    if (item.exclusiveGroup && exclusiveGroups.has(item.exclusiveGroup)) continue;
    selected.push(item);
    if (item.exclusiveGroup) exclusiveGroups.add(item.exclusiveGroup);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function buildPlatformKnowledgeContext(platform: Platform, scope: string, limit = 12): string {
  const selected = retrievePlatformNodeKnowledge(platform, scope, limit);
  if (!selected.length) return `Selected platform: ${platform}. No platform-specific node was retrieved; do not invent one.`;
  return [
    `Selected platform: ${platform}. Use only this platform's terminology.`,
    ...selected.map((item) => [
      `- ${item.name} [${item.canonicalFunctionId}]`,
      `  Purpose: ${item.description}`,
      `  Use when: ${item.useWhen}`,
      `  Do not use when: ${item.doNotUseWhen}`,
    ].join('\n')),
  ].join('\n');
}
