import { workflowBriefEntityTypeSchema } from '@awm/shared';
import { z } from 'zod';

const idSchema = z.string().trim().min(1, 'ID must not be empty.');
const nameSchema = z.string().trim().min(1, 'Name must not be empty.');
const textSchema = z.string().trim().min(1);
const implementationLanguage = /\b(?:n8n|make(?:\.com)?|zapier|reactflow|nodeType|provider|modelId|runtime configuration)\b/i;

export const nodeFunctionCategorySchema = z.enum([
  'trigger', 'action', 'decision', 'routing', 'transformation', 'collection',
  'synchronization', 'timing', 'human', 'resilience', 'ai', 'orchestration', 'terminal',
]);
export const nodeFunctionStatusSchema = z.enum(['foundation', 'detailed', 'deprecated']);

export const nodeFunctionInputRequirementSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  required: z.boolean(),
  clarificationQuestion: textSchema.optional(),
}).strict();

export const nodeFunctionOutputRequirementSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: textSchema,
  minimumCount: z.number().int().nonnegative().optional(),
  maximumCount: z.number().int().nonnegative().optional(),
  semanticLabelRequired: z.boolean(),
  genericLabelsAllowed: z.boolean(),
}).strict().superRefine((output, context) => {
  if (output.minimumCount !== undefined && output.maximumCount !== undefined && output.maximumCount < output.minimumCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'maximumCount must be greater than or equal to minimumCount.', path: ['maximumCount'] });
  }
});

export const nodeFunctionSafeguardSchema = z.object({
  id: idSchema,
  description: textSchema,
  reason: textSchema,
}).strict();

export const nodeFunctionExampleSchema = z.object({
  requirementText: textSchema,
  expectedInterpretation: textSchema,
  valid: z.boolean(),
}).strict();

const uniqueNestedIds = (items: readonly { id: string }[], path: string, context: z.RefinementCtx) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate ${path} ID "${item.id}" is not allowed.`, path: [path, index, 'id'] });
    seen.add(item.id);
  });
};

export const nodeFunctionContractSchema = z.object({
  id: idSchema,
  name: nameSchema,
  category: nodeFunctionCategorySchema,
  status: nodeFunctionStatusSchema,
  purpose: textSchema,
  selectionCriteria: z.array(textSchema).min(1),
  exclusionCriteria: z.array(textSchema).min(1),
  inputRequirements: z.array(nodeFunctionInputRequirementSchema),
  outputRequirements: z.array(nodeFunctionOutputRequirementSchema),
  safeguards: z.array(nodeFunctionSafeguardSchema),
  positiveExamples: z.array(nodeFunctionExampleSchema).min(1),
  negativeExamples: z.array(nodeFunctionExampleSchema).min(1),
  relatedWorkflowBriefEntityTypes: z.array(workflowBriefEntityTypeSchema),
  notes: z.array(textSchema),
}).strict().superRefine((contract, context) => {
  uniqueNestedIds(contract.inputRequirements, 'inputRequirements', context);
  uniqueNestedIds(contract.outputRequirements, 'outputRequirements', context);
  uniqueNestedIds(contract.safeguards, 'safeguards', context);
  if (contract.status === 'detailed' && contract.inputRequirements.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detailed contracts require at least one input requirement.', path: ['inputRequirements'] });
  if (contract.status === 'detailed' && !contract.inputRequirements.some((input) => input.required)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detailed contracts require at least one required input.', path: ['inputRequirements'] });
  if (contract.status === 'detailed' && contract.outputRequirements.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detailed contracts require at least one output requirement.', path: ['outputRequirements'] });
  if (contract.status === 'detailed' && contract.safeguards.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detailed contracts require at least one safeguard.', path: ['safeguards'] });
  if (contract.status === 'detailed' && contract.positiveExamples.length < 2) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detailed contracts require at least two positive examples.', path: ['positiveExamples'] });
  if (contract.status === 'detailed' && contract.negativeExamples.length < 2) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Detailed contracts require at least two negative examples.', path: ['negativeExamples'] });
  if (contract.positiveExamples.some((example) => !example.valid)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Positive examples must be marked valid.', path: ['positiveExamples'] });
  if (contract.negativeExamples.some((example) => example.valid)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Negative examples must be marked invalid.', path: ['negativeExamples'] });
  if (new Set(contract.relatedWorkflowBriefEntityTypes).size !== contract.relatedWorkflowBriefEntityTypes.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Related Workflow Brief entity types must be unique.', path: ['relatedWorkflowBriefEntityTypes'] });
  if (implementationLanguage.test(JSON.stringify(contract))) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Node-function contracts must not contain platform or runtime implementation language.', path: [] });
});

export const nodeFunctionCatalogSchema = z.array(nodeFunctionContractSchema).superRefine((contracts, context) => {
  const seen = new Set<string>();
  contracts.forEach((contract, index) => {
    if (seen.has(contract.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate node-function contract ID "${contract.id}" is not allowed.`, path: [index, 'id'] });
    seen.add(contract.id);
  });
});

export const routerNodeFunctionContract: NodeFunctionContract = {
  id: 'router',
  name: 'Router',
  category: 'routing',
  status: 'detailed',
  purpose: 'Route one workflow execution into one of several business outcomes based on mutually distinguishable conditions.',
  selectionCriteria: [
    'The requirement contains three or more business outcomes.',
    'Outcomes are named departments, statuses, categories, priorities, regions, products, request types, or other semantic destinations.',
    'The requirement explicitly describes routing, categorization, distribution, or choosing among multiple outcomes.',
    'A fallback or unmatched business route may be required.',
  ],
  exclusionCriteria: [
    'Exactly two outcomes are better represented as a binary decision.',
    'Parallel branches that must all execute are not mutually exclusive routing.',
    'Item-by-item collection processing belongs to an iterator.',
    'Retry or loop-back behavior belongs to a loop contract.',
    'Downstream action names alone do not establish a business routing decision.',
  ],
  inputRequirements: [
    { id: 'routing-subject', name: 'Routing subject', description: 'The request, record, case, or other business item being routed.', required: true, clarificationQuestion: 'What business item is being routed?' },
    { id: 'routing-basis', name: 'Routing basis', description: 'The condition or business attribute that distinguishes outcomes.', required: true, clarificationQuestion: 'Which condition determines the matching route?' },
    { id: 'business-outcomes', name: 'Expected business outcomes', description: 'The mutually distinguishable outcomes available to the routing decision.', required: true, clarificationQuestion: 'What are the named business outcomes?' },
    { id: 'fallback-behavior', name: 'Fallback behavior', description: 'The outcome for an unmatched subject when a fallback is relevant.', required: false, clarificationQuestion: 'What should happen when no route condition matches?' },
  ],
  outputRequirements: [
    { id: 'semantic-routes', name: 'Semantic business routes', description: 'At least two routes with stable business labels.', minimumCount: 2, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'route-meaning', name: 'Route condition or meaning', description: 'The business condition that selects each route.', minimumCount: 2, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'route-target', name: 'Target business outcome', description: 'The business outcome or next action reached by each route.', minimumCount: 2, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'fallback-route', name: 'Fallback route', description: 'An optional unmatched outcome when the listed routes are not exhaustive.', minimumCount: 0, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'no-sequential-inference', description: 'Do not infer a Router from a list of sequential actions.', reason: 'Sequence does not imply mutually exclusive selection.' },
    { id: 'stable-route-semantics', description: 'Do not use destination action names as route semantics.', reason: 'A route describes why an outcome is selected, independently of the downstream action title.' },
    { id: 'no-generic-routes', description: 'Do not create generic numbered routes in a locked Workflow Brief.', reason: 'Every locked route must preserve a meaningful business outcome.' },
    { id: 'exclude-parallel', description: 'Do not treat parallel execution as mutually exclusive routing.', reason: 'Parallel branches may all execute, while a Router selects an outcome.' },
    { id: 'bounded-fallback', description: 'Do not force a fallback when the requirement provides complete exhaustive outcomes.', reason: 'Fallback behavior must reflect an actual unmatched possibility.' },
    { id: 'clarify-overlap', description: 'Request clarification when outcomes overlap or routing conditions are missing.', reason: 'Overlapping or absent conditions do not define a deterministic selection.' },
  ],
  positiveExamples: [
    { requirementText: 'Route incoming requests to IT, Marketing, or Customer Support.', expectedInterpretation: 'Route by responsible department using IT, Marketing, and Customer Support labels.', valid: true },
    { requirementText: 'Classify invoices as Paid, Pending, or Overdue.', expectedInterpretation: 'Route by invoice status using Paid, Pending, and Overdue labels.', valid: true },
    { requirementText: 'Send high-priority cases to escalation, medium-priority cases to review, and low-priority cases to the standard queue.', expectedInterpretation: 'Route by priority using High Priority, Medium Priority, and Low Priority labels.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'If approved, continue; otherwise stop.', expectedInterpretation: 'Use a binary decision.', valid: false },
    { requirementText: 'Send the same message to chat and email.', expectedInterpretation: 'Use parallel fan-out, not mutually exclusive routing.', valid: false },
    { requirementText: 'For each attachment, save the file.', expectedInterpretation: 'Use an iterator.', valid: false },
    { requirementText: 'Retry twice if delivery fails.', expectedInterpretation: 'Use a retry loop.', valid: false },
    { requirementText: 'Create a Finance ticket.', expectedInterpretation: 'Use an action; no routing decision is present.', valid: false },
    { requirementText: 'Create Output 1 and Output 2.', expectedInterpretation: 'Reject generic numbered route labels.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['decision', 'route'],
  notes: ['Route labels remain stable when a downstream action is renamed.'],
};

export const binaryDecisionNodeFunctionContract: NodeFunctionContract = {
  id: 'binary-decision', name: 'Binary Decision', category: 'decision', status: 'detailed',
  purpose: 'Choose exactly one of two mutually exclusive business outcomes.',
  selectionCriteria: [
    'The requirement expresses an if/otherwise, yes/no, valid/invalid, approved/rejected, success/failure, present/missing, or equivalent decision.',
    'Exactly two meaningful outcomes are present.',
    'Both outcomes change workflow behavior.',
  ],
  exclusionCriteria: [
    'Three or more outcomes belong to a Router.', 'Parallel branches that must both run are not a decision.',
    'Retry or loop-back behavior belongs to a Loop-family contract.', 'Descriptive status text does not create a decision boundary.',
    'A condition without an alternate workflow outcome is incomplete for a Binary Decision.',
  ],
  inputRequirements: [
    { id: 'decision-subject', name: 'Decision subject', description: 'The business item or state being evaluated.', required: true, clarificationQuestion: 'What business item or state is being evaluated?' },
    { id: 'decision-condition', name: 'Decision condition', description: 'The condition that separates the two outcomes.', required: true, clarificationQuestion: 'What condition determines the outcome?' },
    { id: 'positive-outcome', name: 'Positive outcome', description: 'The action or result for the matching condition.', required: true, clarificationQuestion: 'What happens when the condition matches?' },
    { id: 'alternate-outcome', name: 'Alternate outcome', description: 'The action or result when the condition does not match.', required: true, clarificationQuestion: 'What happens otherwise?' },
  ],
  outputRequirements: [
    { id: 'binary-routes', name: 'Two outcome routes', description: 'Exactly two mutually exclusive business routes.', minimumCount: 2, maximumCount: 2, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'route-conditions', name: 'Route conditions', description: 'A condition or meaning for each route.', minimumCount: 2, maximumCount: 2, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'route-outcomes', name: 'Route outcomes', description: 'The preserved business action or result for each route.', minimumCount: 2, maximumCount: 2, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'require-alternate', description: 'Do not create a Binary Decision from descriptive if-language without an alternate path.', reason: 'A decision requires two workflow outcomes.' },
    { id: 'exclude-router', description: 'Do not classify three or more outcomes as binary.', reason: 'Multi-outcome selection belongs to Router.' },
    { id: 'exclude-status-adjective', description: 'Do not turn approval-status adjectives into a new decision.', reason: 'Existing status is not an active decision boundary.' },
    { id: 'preserve-actions', description: 'Do not flatten branch actions into generic outcome placeholders.', reason: 'Branch behavior is part of the business requirement.' },
    { id: 'preserve-labels', description: 'Preserve explicit labels such as Interested and Not Interested; use TRUE and FALSE only as fallbacks.', reason: 'Requirement-provided labels carry stronger business meaning.' },
  ],
  positiveExamples: [
    { requirementText: 'If the payment succeeds, send a receipt; otherwise notify finance.', expectedInterpretation: 'Create success and failure routes with their stated actions.', valid: true },
    { requirementText: 'If the lead is interested, return to qualification; otherwise end the sequence.', expectedInterpretation: 'Create Interested and Not Interested outcomes.', valid: true },
    { requirementText: 'When the record is valid, save it; if not, send it for review.', expectedInterpretation: 'Create Valid and Invalid outcomes.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Route requests to IT, Marketing, or Customer Support.', expectedInterpretation: 'Use a Router.', valid: false },
    { requirementText: 'Send the same alert to chat and email.', expectedInterpretation: 'Use parallel fan-out.', valid: false },
    { requirementText: 'Retry if delivery fails.', expectedInterpretation: 'Use a retry loop.', valid: false },
    { requirementText: 'Process approved content.', expectedInterpretation: 'Treat approved as descriptive status.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['decision', 'route'],
  notes: ['TRUE and FALSE are fallback labels only when the requirement supplies no semantic labels.'],
};

export const retryNodeFunctionContract: NodeFunctionContract = {
  id: 'retry', name: 'Retry', category: 'resilience', status: 'detailed',
  purpose: 'Repeat a failed or incomplete operation for a bounded number of attempts before following a final failure path.',
  selectionCriteria: ['The requirement says retry, try again, attempt again, or retry up to a stated number of times.', 'Failure or an incomplete result causes the repeated execution.', 'A safe attempt limit is explicit or required.'],
  exclusionCriteria: ['Collection iteration is not Retry.', 'Scheduled outreach belongs to Follow-up Loop.', 'Revision after feedback belongs to Revision Loop.', 'Repeated state checks belong to Polling Loop.', 'Unbounded repetition without a safe exit is invalid Retry behavior.'],
  inputRequirements: [
    { id: 'retried-operation', name: 'Operation being retried', description: 'The failed or incomplete business operation.', required: true },
    { id: 'retry-condition', name: 'Retry condition', description: 'The failure or incomplete state that permits another attempt.', required: true },
    { id: 'maximum-attempts', name: 'Maximum attempts', description: 'The upper bound on total attempts.', required: true, clarificationQuestion: 'How many attempts are allowed before exhaustion?' },
    { id: 'exhausted-outcome', name: 'Final exhausted outcome', description: 'The business handling after all attempts fail.', required: true },
    { id: 'retry-delay', name: 'Delay between attempts', description: 'An optional waiting boundary between attempts.', required: false },
  ],
  outputRequirements: [
    { id: 'retry-path', name: 'Retry path', description: 'The path returning to the retried operation.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'success-exit', name: 'Success exit', description: 'The outcome after a successful attempt.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'exhausted-exit', name: 'Exhausted exit', description: 'The final failure outcome after the attempt bound.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'loop-back-target', name: 'Loop-back target', description: 'The operation that receives the next attempt.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'bounded-attempts', description: 'Require a maximum attempt count.', reason: 'Retries must not run forever.' },
    { id: 'preserve-exhaustion', description: 'Preserve final exhausted handling.', reason: 'Failure after the bound is a required business outcome.' },
    { id: 'exclude-follow-up', description: 'Do not confuse communication cadence with technical retry.', reason: 'Follow-up has a response boundary and human outreach semantics.' },
    { id: 'clarify-bound', description: 'Request clarification when only retry is stated without a safe bound.', reason: 'A deterministic retry requires an explicit limit.' },
  ],
  positiveExamples: [
    { requirementText: 'Retry the API request up to three times, then alert operations.', expectedInterpretation: 'Retry the request under a three-attempt bound and preserve the alert outcome.', valid: true },
    { requirementText: 'If the upload fails, try again twice before logging the failure.', expectedInterpretation: 'Repeat upload twice and exit to failure logging when exhausted.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Follow up with the lead every two days.', expectedInterpretation: 'Use a Follow-up Loop.', valid: false },
    { requirementText: 'For each file, process the attachment.', expectedInterpretation: 'Use an Iterator.', valid: false },
    { requirementText: 'Check every hour until the report is ready.', expectedInterpretation: 'Use a Polling Loop.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['loop', 'action'], notes: ['Maps to bounded-retry with explicit maximumIterations.'],
};

export const followUpLoopNodeFunctionContract: NodeFunctionContract = {
  id: 'follow-up-loop', name: 'Follow-up Loop', category: 'timing', status: 'detailed',
  purpose: 'Repeat outreach, reminders, or follow-up actions until a response, business outcome, or attempt limit is reached.',
  selectionCriteria: ['No response causes another follow-up.', 'The requirement defines a reminder or outreach cadence.', 'Outreach targets a lead, customer, owner, or reviewer.', 'A response, success condition, or maximum attempts stops follow-up.'],
  exclusionCriteria: ['Immediate technical retry belongs to Retry.', 'Collection iteration belongs to Iterator.', 'Revision after feedback belongs to Revision Loop.', 'Checking system state without communication belongs to Polling Loop.', 'A repeated action without a business stop condition is incomplete.'],
  inputRequirements: [
    { id: 'follow-up-action', name: 'Follow-up action', description: 'The outreach or reminder repeated after the initial contact.', required: true },
    { id: 'cadence', name: 'Cadence or wait boundary', description: 'The interval between follow-up attempts.', required: true, clarificationQuestion: 'How long should the process wait between follow-ups?' },
    { id: 'response-condition', name: 'Response or success condition', description: 'The outcome that stops outreach.', required: true },
    { id: 'maximum-attempts', name: 'Maximum attempts', description: 'An optional explicit outreach bound.', required: false },
    { id: 'no-response-outcome', name: 'Final no-response outcome', description: 'The handling when outreach ends without a response.', required: true },
  ],
  outputRequirements: [
    { id: 'follow-up-path', name: 'Follow-up path', description: 'The path that schedules and performs another outreach.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'response-exit', name: 'Response exit', description: 'The path taken when the response or success condition is met.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'no-response-exit', name: 'No-response exit', description: 'The terminal or escalation outcome after the stopping rule.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'return-destination', name: 'Return destination', description: 'An optional business step resumed after a response.', minimumCount: 0, maximumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'notification-placement', description: 'Do not place completion notifications inside the repeated body unless they are explicitly per-attempt.', reason: 'Completion communication should occur after the loop boundary.' },
    { id: 'preserve-wait', description: 'Preserve the cadence as a wait boundary.', reason: 'Follow-up timing is part of the business requirement.' },
    { id: 'separate-first-contact', description: 'Distinguish first contact from later follow-ups.', reason: 'Initial outreach and repeated reminders may have different meaning.' },
    { id: 'bounded-outreach', description: 'Do not assume unlimited attempts; clarify a missing cadence or stopping rule.', reason: 'Outreach must have a safe business exit.' },
  ],
  positiveExamples: [
    { requirementText: 'If the lead does not reply, follow up after two days, up to three attempts.', expectedInterpretation: 'Wait two days between follow-ups and stop after a response or three attempts.', valid: true },
    { requirementText: 'Send weekly reminders until the form is submitted.', expectedInterpretation: 'Repeat weekly outreach until submission.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Retry the failed API call twice.', expectedInterpretation: 'Use Retry.', valid: false },
    { requirementText: 'Check every five minutes until processing completes.', expectedInterpretation: 'Use a Polling Loop.', valid: false },
    { requirementText: 'Revise the draft after reviewer feedback.', expectedInterpretation: 'Use a Revision Loop.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['loop', 'wait', 'decision', 'action'], notes: ['Maps to loopType follow-up and may coordinate with Wait and Binary Decision.'],
};

export const revisionLoopNodeFunctionContract: NodeFunctionContract = {
  id: 'revision-loop', name: 'Revision Loop', category: 'human', status: 'detailed',
  purpose: 'Return work for changes and repeat review until accepted or until a defined limit or termination condition is reached.',
  selectionCriteria: ['Rejected work returns for revision.', 'A reviewer requests changes.', 'Work is revised and resubmitted.', 'Approval or review repeats after edits.'],
  exclusionCriteria: ['Technical failure retry belongs to Retry.', 'Outreach belongs to Follow-up Loop.', 'Repeated external-state checks belong to Polling Loop.', 'Approval with no return path is not a Revision Loop.', 'A return unrelated to changes belongs to Return-to-step Loop.'],
  inputRequirements: [
    { id: 'revised-item', name: 'Item being revised', description: 'The work product returned for changes.', required: true },
    { id: 'feedback-condition', name: 'Feedback or rejection condition', description: 'The review result that requires changes.', required: true },
    { id: 'revision-action', name: 'Revision action', description: 'The business action that applies requested changes.', required: true },
    { id: 'rereview-action', name: 'Resubmission or re-review action', description: 'The action that sends revised work back for review.', required: true },
    { id: 'acceptance-condition', name: 'Acceptance or termination condition', description: 'The outcome that ends revision.', required: true },
  ],
  outputRequirements: [
    { id: 'revision-path', name: 'Revision path', description: 'The path returning rejected work for changes.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'rereview-path', name: 'Return-to-review path', description: 'The path from completed changes back to review.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'accepted-exit', name: 'Accepted exit', description: 'The outcome after work is accepted.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'revision-limit', name: 'Revision limit outcome', description: 'An optional escalation or termination after a revision bound.', minimumCount: 0, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'require-return-for-changes', description: 'Require a real return-for-changes path.', reason: 'A plain approval decision is not a revision loop.' },
    { id: 'preserve-feedback', description: 'Preserve the reviewer feedback boundary.', reason: 'Feedback explains what causes and guides revision.' },
    { id: 'safe-exit', description: 'Do not create an unbounded loop without acceptance, termination, or escalation.', reason: 'Revision requires a defined exit.' },
    { id: 'separate-approval', description: 'Keep approval and revision semantics distinct.', reason: 'Approval decides; revision changes and resubmits work.' },
  ],
  positiveExamples: [
    { requirementText: 'If rejected, return the draft to the writer for changes and resubmit for approval.', expectedInterpretation: 'Return rejected work for revision and loop back to approval.', valid: true },
    { requirementText: 'Revise the proposal based on feedback until approved or after three rounds escalate.', expectedInterpretation: 'Repeat revision and review with acceptance and escalation exits.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'If approved continue, otherwise stop.', expectedInterpretation: 'Use a Binary Decision.', valid: false },
    { requirementText: 'Retry the upload twice.', expectedInterpretation: 'Use Retry.', valid: false },
    { requirementText: 'Follow up with the reviewer tomorrow.', expectedInterpretation: 'Use a Follow-up Loop.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['loop', 'approval', 'decision', 'action'], notes: ['Maps to loopType revision and preserves return to review.'],
};

export const pollingLoopNodeFunctionContract: NodeFunctionContract = {
  id: 'polling-loop', name: 'Polling Loop', category: 'timing', status: 'detailed',
  purpose: 'Check an external state repeatedly at a defined interval until a target condition, timeout, or attempt limit is reached.',
  selectionCriteria: ['The requirement says check every stated interval.', 'A status is polled until complete.', 'State is repeatedly retrieved until available.', 'Waiting occurs through repeated checks rather than a direct event.'],
  exclusionCriteria: ['One fixed delay belongs to Wait.', 'User reminders belong to Follow-up Loop.', 'Retrying a failed operation belongs to Retry.', 'Collection processing belongs to Iterator.', 'A direct event-driven resume boundary belongs to Wait.'],
  inputRequirements: [
    { id: 'polled-state', name: 'State or resource being checked', description: 'The external business state retrieved on each check.', required: true },
    { id: 'polling-interval', name: 'Polling interval', description: 'The waiting interval between checks.', required: true, clarificationQuestion: 'How frequently should the state be checked?' },
    { id: 'completion-condition', name: 'Completion condition', description: 'The target state that stops polling successfully.', required: true },
    { id: 'polling-bound', name: 'Timeout or maximum checks', description: 'The time or attempt bound that prevents indefinite checking.', required: true, clarificationQuestion: 'When should polling time out?' },
    { id: 'timeout-outcome', name: 'Timeout outcome', description: 'The handling after the polling bound is reached.', required: true },
  ],
  outputRequirements: [
    { id: 'check-action', name: 'Check action', description: 'The repeated state retrieval or status check.', minimumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'completed-exit', name: 'Completed exit', description: 'The path when the target condition is met.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'continue-path', name: 'Continue polling path', description: 'The path that waits and performs another check.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'timeout-exit', name: 'Timeout exit', description: 'The exhausted outcome after the polling bound.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'require-interval', description: 'Require a polling interval.', reason: 'Repeated checks need an explicit cadence.' },
    { id: 'bounded-frequency', description: 'Do not create unbounded high-frequency polling.', reason: 'Polling needs a safe timeout or maximum checks.' },
    { id: 'preserve-timeout', description: 'Preserve timeout handling.', reason: 'The exhausted state is a business outcome.' },
    { id: 'prefer-event-wait', description: 'Use a direct event wait when the requirement provides an event-driven resume boundary.', reason: 'An event boundary does not require repeated checking.' },
    { id: 'require-checking-language', description: 'Do not treat until alone as polling.', reason: 'Polling requires repeated checking language.' },
  ],
  positiveExamples: [
    { requirementText: 'Check the export status every five minutes until it is complete or one hour has passed.', expectedInterpretation: 'Poll every five minutes with completion and one-hour timeout exits.', valid: true },
    { requirementText: 'Poll the payment status until confirmed, up to ten checks.', expectedInterpretation: 'Repeat status checks under a ten-check bound.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Wait until the customer replies.', expectedInterpretation: 'Use Wait until response.', valid: false },
    { requirementText: 'Retry the failed request three times.', expectedInterpretation: 'Use Retry.', valid: false },
    { requirementText: 'Send reminders every two days.', expectedInterpretation: 'Use a Follow-up Loop.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['loop', 'wait', 'action'], notes: ['Maps to loopType polling with intervalDescription and bounded exit information.'],
};

export const returnToStepLoopNodeFunctionContract: NodeFunctionContract = {
  id: 'return-to-step-loop', name: 'Return-to-step Loop', category: 'orchestration', status: 'detailed',
  purpose: 'Return execution to a named earlier business step when a later outcome requires reprocessing from that point.',
  selectionCriteria: ['The requirement says go back to a named business stage.', 'Execution returns to a numbered step whose business action is unambiguous.', 'Work returns to data collection or another named earlier checkpoint.', 'A later outcome requires repeating from a specific earlier action.'],
  exclusionCriteria: ['Immediate retry of the same failure belongs to Retry.', 'A revision-specific return belongs to Revision Loop.', 'Collection processing belongs to Iterator.', 'Outreach reminders belong to Follow-up Loop.', 'Vague start-over wording without a target is insufficient.'],
  inputRequirements: [
    { id: 'return-condition', name: 'Return condition', description: 'The later outcome that sends execution backward.', required: true },
    { id: 'loop-back-target', name: 'Loop-back target action', description: 'The named earlier business action that resumes processing.', required: true, clarificationQuestion: 'Which earlier business action should resume?' },
    { id: 'repeated-steps', name: 'Repeated path steps', description: 'The actions included after returning to the checkpoint.', required: true },
    { id: 'exit-condition', name: 'Exit condition', description: 'The outcome that permits normal continuation.', required: true },
    { id: 'maximum-returns', name: 'Maximum returns', description: 'An optional upper bound on repeated returns.', required: false },
  ],
  outputRequirements: [
    { id: 'loop-back-route', name: 'Loop-back route', description: 'The route to the named earlier action.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'continuation-exit', name: 'Continuation exit', description: 'The successful path after the exit condition.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'bounded-termination', name: 'Bounded termination outcome', description: 'An optional exhausted outcome when returns are limited.', minimumCount: 0, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'actual-earlier-action', description: 'Require the loop-back target to reference an actual earlier business action.', reason: 'The repeated path must start at a resolvable checkpoint.' },
    { id: 'no-step-assumption', description: 'Do not infer a target from unclear step numbering.', reason: 'A numbered reference may be ambiguous after edits.' },
    { id: 'exclude-history', description: 'Do not create a loop from descriptive references to historical steps.', reason: 'History does not instruct execution to return.' },
    { id: 'clarify-missing-target', description: 'Request clarification when the named return target does not exist.', reason: 'An unresolved target cannot define a valid loop.' },
    { id: 'respect-boundary', description: 'Avoid crossing unrelated workflow boundaries.', reason: 'A return must remain within the same business process scope.' },
  ],
  positiveExamples: [
    { requirementText: 'If the lead becomes interested on the second follow-up, return to qualification.', expectedInterpretation: 'Loop back to the named qualification action.', valid: true },
    { requirementText: 'If validation fails, return to data collection and process the corrected record again.', expectedInterpretation: 'Loop back to data collection and repeat the correction path.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Retry the API call.', expectedInterpretation: 'Use Retry.', valid: false },
    { requirementText: 'Revise the document after feedback.', expectedInterpretation: 'Use a Revision Loop.', valid: false },
    { requirementText: 'Process each attachment.', expectedInterpretation: 'Use an Iterator.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['loop', 'action', 'decision'], notes: ['Maps to loopType return-to-step with a required loopBackActionId.'],
};

type FoundationSeed = { id: string; name: string; category: NodeFunctionCategory; entities: NodeFunctionContract['relatedWorkflowBriefEntityTypes'] };
const foundationSeeds: FoundationSeed[] = [
  { id: 'trigger', name: 'Trigger', category: 'trigger', entities: ['trigger'] },
  { id: 'action', name: 'Action', category: 'action', entities: ['action'] },
  { id: 'filter', name: 'Filter', category: 'decision', entities: ['decision', 'route'] },
  { id: 'iterator', name: 'Iterator', category: 'collection', entities: ['iterator'] },
  { id: 'aggregator', name: 'Aggregator', category: 'collection', entities: ['aggregator'] },
  { id: 'merge', name: 'Merge', category: 'synchronization', entities: ['merge'] },
  { id: 'wait', name: 'Wait', category: 'timing', entities: ['wait'] },
  { id: 'approval', name: 'Approval', category: 'human', entities: ['approval'] },
  { id: 'error-handler', name: 'Error Handler', category: 'resilience', entities: ['capability'] },
  { id: 'sub-workflow', name: 'Sub-workflow', category: 'orchestration', entities: ['capability'] },
  { id: 'terminal', name: 'Terminal', category: 'terminal', entities: ['action'] },
  { id: 'ai-agent', name: 'AI Agent', category: 'ai', entities: ['capability'] },
  { id: 'ai-classification', name: 'AI Classification', category: 'ai', entities: ['capability'] },
  { id: 'ai-extraction', name: 'AI Extraction', category: 'ai', entities: ['capability'] },
  { id: 'ai-summarization', name: 'AI Summarization', category: 'ai', entities: ['capability'] },
  { id: 'ai-generation', name: 'AI Generation', category: 'ai', entities: ['capability'] },
];

const foundationContract = (seed: FoundationSeed): NodeFunctionContract => ({
  id: seed.id,
  name: seed.name,
  category: seed.category,
  status: 'foundation',
  purpose: `Represent the conceptual business function ${seed.name}.`,
  selectionCriteria: [`Use when the reviewed business requirement explicitly needs ${seed.name}.`],
  exclusionCriteria: [`Do not use when the requirement does not establish ${seed.name} behavior.`],
  inputRequirements: [], outputRequirements: [], safeguards: [],
  positiveExamples: [{ requirementText: `The process explicitly requires ${seed.name}.`, expectedInterpretation: `Record ${seed.name} as a conceptual function for later detailed review.`, valid: true }],
  negativeExamples: [{ requirementText: `The process does not require ${seed.name}.`, expectedInterpretation: `Do not select ${seed.name}.`, valid: false }],
  relatedWorkflowBriefEntityTypes: seed.entities,
  notes: ['Detailed behavior is intentionally deferred.'],
});

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
};

const internalNodeFunctionCatalog = deepFreeze(nodeFunctionCatalogSchema.parse([
  ...foundationSeeds.map(foundationContract),
  routerNodeFunctionContract,
  binaryDecisionNodeFunctionContract,
  retryNodeFunctionContract,
  followUpLoopNodeFunctionContract,
  revisionLoopNodeFunctionContract,
  pollingLoopNodeFunctionContract,
  returnToStepLoopNodeFunctionContract,
]));

export function parseNodeFunctionContract(input: unknown): NodeFunctionContract {
  return nodeFunctionContractSchema.parse(input);
}

export function safeParseNodeFunctionContract(input: unknown) {
  return nodeFunctionContractSchema.safeParse(input);
}

export function getNodeFunctionContract(id: string): NodeFunctionContract | undefined {
  const normalizedId = id.trim().toLowerCase();
  const contract = internalNodeFunctionCatalog.find((item) => item.id === normalizedId);
  return contract ? structuredClone(contract) : undefined;
}

export function listNodeFunctionContracts(): NodeFunctionContract[] {
  return structuredClone(internalNodeFunctionCatalog);
}

export function hasNodeFunctionContract(id: string): boolean {
  return internalNodeFunctionCatalog.some((item) => item.id === id.trim().toLowerCase());
}

export type NodeFunctionCategory = z.infer<typeof nodeFunctionCategorySchema>;
export type NodeFunctionStatus = z.infer<typeof nodeFunctionStatusSchema>;
export type NodeFunctionInputRequirement = z.infer<typeof nodeFunctionInputRequirementSchema>;
export type NodeFunctionOutputRequirement = z.infer<typeof nodeFunctionOutputRequirementSchema>;
export type NodeFunctionSafeguard = z.infer<typeof nodeFunctionSafeguardSchema>;
export type NodeFunctionExample = z.infer<typeof nodeFunctionExampleSchema>;
export type NodeFunctionContract = z.infer<typeof nodeFunctionContractSchema>;
