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

export const waitNodeFunctionContract: NodeFunctionContract = {
  id: 'wait', name: 'Wait', category: 'timing', status: 'detailed',
  purpose: 'Pause workflow execution until a stated duration, date, event, response, or approval boundary is reached.',
  selectionCriteria: ['Wait for a fixed duration.', 'Wait until a date or deadline.', 'Pause until an event occurs.', 'Wait for a customer or external response.', 'Resume after an approval or business event.'],
  exclusionCriteria: ['Repeated technical attempts belong to Retry.', 'Repeated status checks belong to Polling Loop.', 'Communication cadence belongs to Follow-up Loop.', 'A recurring schedule that starts new executions belongs to Trigger.', 'Vague delay wording without a meaningful boundary is incomplete.'],
  inputRequirements: [
    { id: 'wait-type', name: 'Wait type', description: 'The duration, date, event, response, or approval boundary type.', required: true },
    { id: 'boundary-description', name: 'Boundary description', description: 'The exact business boundary that ends the pause.', required: true, clarificationQuestion: 'What event, date, duration, response, or approval resumes the workflow?' },
    { id: 'resume-condition', name: 'Resume condition', description: 'The condition that confirms the boundary was reached.', required: true },
    { id: 'resume-action', name: 'Resume action', description: 'The next business action after waiting.', required: true },
    { id: 'boundary-detail', name: 'Duration, date, or event detail', description: 'The concrete detail required by the selected wait type.', required: true },
  ],
  outputRequirements: [
    { id: 'paused-state', name: 'Paused state', description: 'The workflow state while the boundary remains unmet.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'resume-path', name: 'Resume path', description: 'The continuation after the stated boundary.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'timeout-path', name: 'Timeout or alternate path', description: 'An optional explicit outcome when waiting ends another way.', minimumCount: 0, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'preserve-boundary', description: 'Preserve the actual duration, date, event, response, or approval boundary.', reason: 'The boundary determines when execution may resume.' },
    { id: 'no-invented-detail', description: 'Do not invent durations, dates, or events.', reason: 'Wait details must come from reviewed business requirements.' },
    { id: 'exclude-polling', description: 'Do not treat until alone as polling.', reason: 'Polling requires explicit repeated checking.' },
    { id: 'event-versus-check', description: 'Distinguish event-driven waiting from repeated state checks.', reason: 'They represent different business behavior.' },
    { id: 'clarify-resume', description: 'Request clarification when the resume boundary is unclear.', reason: 'An unresolved boundary cannot define a deterministic Wait.' },
    { id: 'exclude-recurring-follow-up', description: 'Do not flatten recurring follow-up into one Wait.', reason: 'Follow-up includes repeated outreach and stopping semantics.' },
  ],
  positiveExamples: [
    { requirementText: 'Wait three days before sending the next follow-up.', expectedInterpretation: 'Pause for three days, then resume at the next follow-up.', valid: true },
    { requirementText: 'Pause until the customer replies.', expectedInterpretation: 'Wait for the customer-response event.', valid: true },
    { requirementText: 'Resume after manager approval.', expectedInterpretation: 'Wait for the manager-approval boundary.', valid: true },
    { requirementText: 'Wait until the invoice due date.', expectedInterpretation: 'Wait until the stated business date.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Check every five minutes until complete.', expectedInterpretation: 'Use a Polling Loop.', valid: false },
    { requirementText: 'Retry the failed request three times.', expectedInterpretation: 'Use Retry.', valid: false },
    { requirementText: 'Run every Monday.', expectedInterpretation: 'Use a schedule Trigger.', valid: false },
    { requirementText: 'Send reminders every two days.', expectedInterpretation: 'Use a Follow-up Loop.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['wait', 'action'], notes: ['Maps to WorkflowBriefWait and its waitType-specific boundary field.'],
};

export const approvalNodeFunctionContract: NodeFunctionContract = {
  id: 'approval', name: 'Approval', category: 'human', status: 'detailed',
  purpose: 'Create a real human decision boundary where a person reviews, approves, rejects, or requests changes before continuation.',
  selectionCriteria: ['Work is sent for approval.', 'Human review is required.', 'The workflow waits for an approve or reject decision.', 'A supervisor, manager, client, or reviewer decides.', 'Continuation branches on the approval outcome.'],
  exclusionCriteria: ['Descriptive approved-status phrases do not create approval.', 'Automatic validation has no human reviewer.', 'A system condition without human authority belongs to Binary Decision.', 'Notification to a person is not a decision request.', 'Historical approval mentions do not create a new boundary.'],
  inputRequirements: [
    { id: 'reviewed-item', name: 'Item or request being reviewed', description: 'The business item submitted for a human decision.', required: true },
    { id: 'approver-role', name: 'Approver or decision role', description: 'The person or role authorized to decide.', required: true, clarificationQuestion: 'Who has authority to approve or reject?' },
    { id: 'approval-criteria', name: 'Approval criteria', description: 'Optional stated criteria used by the reviewer.', required: false },
    { id: 'approved-outcome', name: 'Approved outcome', description: 'The business continuation after approval.', required: true },
    { id: 'rejected-outcome', name: 'Rejected outcome', description: 'The business handling after rejection.', required: true },
    { id: 'alternate-behavior', name: 'Timeout or revision behavior', description: 'An optional timeout or return-for-changes outcome.', required: false },
  ],
  outputRequirements: [
    { id: 'approval-request', name: 'Approval request boundary', description: 'The active request for a human decision.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'approved-route', name: 'Approved route', description: 'The explicitly approved business outcome.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'rejected-route', name: 'Rejected route', description: 'The explicitly rejected business outcome.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'timeout-revision-route', name: 'Timeout or revision route', description: 'An optional stated alternate decision outcome.', minimumCount: 0, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'active-language', description: 'Require active approval, review, or decision language.', reason: 'Approval is an action boundary, not a status adjective.' },
    { id: 'exclude-adjective', description: 'Do not infer approval from descriptive approved status.', reason: 'Already-approved content does not request a new decision.' },
    { id: 'exclude-notification', description: 'Do not treat notification as approval.', reason: 'A recipient without decision authority is not an approver.' },
    { id: 'preserve-outcomes', description: 'Preserve approved and rejected semantics.', reason: 'The human decision determines distinct business paths.' },
    { id: 'separate-revision', description: 'Distinguish plain rejection from a Revision Loop return.', reason: 'Revision requires changes and resubmission.' },
    { id: 'clarify-authority', description: 'Request clarification when the approver or an outcome is missing.', reason: 'A human boundary requires authority and decision handling.' },
  ],
  positiveExamples: [
    { requirementText: 'Send the proposal to the manager for approval.', expectedInterpretation: 'Request an authorized manager decision.', valid: true },
    { requirementText: 'Wait until the client approves or rejects the design.', expectedInterpretation: 'Create approved and rejected routes from a client decision.', valid: true },
    { requirementText: 'Require human review before publishing.', expectedInterpretation: 'Pause publication at a human-review boundary.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Publish approved social posts.', expectedInterpretation: 'Treat approved as descriptive status.', valid: false },
    { requirementText: 'Validate the invoice automatically.', expectedInterpretation: 'Use Validation.', valid: false },
    { requirementText: 'Notify the manager.', expectedInterpretation: 'Use Notification.', valid: false },
    { requirementText: 'If payment succeeds, continue.', expectedInterpretation: 'Use a system condition, not Approval.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['approval', 'actor', 'action', 'route'], notes: ['Maps to WorkflowBriefApproval and its distinct approved and rejected route references.'],
};

export const mergeNodeFunctionContract: NodeFunctionContract = {
  id: 'merge', name: 'Merge', category: 'synchronization', status: 'detailed',
  purpose: 'Synchronize or reunite multiple workflow branches before continuing to a shared downstream business step.',
  selectionCriteria: ['Continue after all branches finish.', 'Continue when any branch completes.', 'Continue with the first completed result.', 'Parallel outcomes reunite before a shared step.', 'Approvals, checks, or parallel work reconverge.'],
  exclusionCriteria: ['Mutually exclusive Router outcomes do not need Merge unless they explicitly reconverge.', 'Collection result recombination belongs to Aggregator.', 'Sequential flow has no branch synchronization.', 'Combining fields is data transformation.', 'Duplicate downstream connections alone do not establish synchronization.'],
  inputRequirements: [
    { id: 'incoming-branches', name: 'Incoming branches', description: 'At least two workflow branches entering synchronization.', required: true },
    { id: 'merge-strategy', name: 'Merge strategy', description: 'Whether all, any, or the first completed branch permits continuation.', required: true, clarificationQuestion: 'Must all branches finish, any branch finish, or only the first result continue?' },
    { id: 'downstream-target', name: 'Downstream target', description: 'The shared business action after synchronization.', required: true },
    { id: 'completion-semantics', name: 'Correlation or completion semantics', description: 'Optional rules establishing which branch completions belong together.', required: false },
  ],
  outputRequirements: [
    { id: 'incoming-boundary', name: 'Merged branch boundary', description: 'A synchronization boundary with at least two incoming branches.', minimumCount: 2, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'synchronized-continuation', name: 'Synchronized continuation', description: 'One continuation governed by the merge strategy.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'target-action', name: 'Target business action', description: 'The shared action reached after synchronization.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'minimum-branches', description: 'Require at least two incoming branches.', reason: 'One branch does not require synchronization.' },
    { id: 'preserve-strategy', description: 'Preserve all, any, and first-completed semantics.', reason: 'Each strategy has different continuation behavior.' },
    { id: 'not-visual-junction', description: 'Do not use Merge as a generic visual junction.', reason: 'A Merge represents a real synchronization boundary.' },
    { id: 'exclude-aggregator', description: 'Do not confuse Merge with Aggregator.', reason: 'Merge synchronizes branches; Aggregator recombines collection results.' },
    { id: 'bounded-reconvergence', description: 'Do not merge mutually exclusive routes unless the process explicitly reconverges.', reason: 'A shared continuation must be a stated business need.' },
    { id: 'clarify-strategy', description: 'Request clarification when synchronization behavior is unspecified.', reason: 'Continuation cannot be determined without a merge strategy.' },
  ],
  positiveExamples: [
    { requirementText: 'After Finance and Legal both approve, create the contract.', expectedInterpretation: 'Merge all approval branches before contract creation.', valid: true },
    { requirementText: 'Continue when either the customer reply or timeout path completes.', expectedInterpretation: 'Merge using any-completed semantics.', valid: true },
    { requirementText: 'Wait for all onboarding checks before activating the employee.', expectedInterpretation: 'Synchronize all check branches before activation.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Route requests to IT or HR.', expectedInterpretation: 'Use a decision route, not branch synchronization.', valid: false },
    { requirementText: 'Collect all processed invoice totals.', expectedInterpretation: 'Use Aggregator.', valid: false },
    { requirementText: 'Then send an email.', expectedInterpretation: 'Use a sequential Action.', valid: false },
    { requirementText: 'Combine first and last name.', expectedInterpretation: 'Use data transformation.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['merge', 'route', 'action'], notes: ['Maps to WorkflowBriefMerge with all, any, or first-completed strategy.'],
};

export const iteratorNodeFunctionContract: NodeFunctionContract = {
  id: 'iterator', name: 'Iterator', category: 'collection', status: 'detailed',
  purpose: 'Process each item in a business collection individually using the same repeated body of actions.',
  selectionCriteria: ['The requirement says for each item.', 'Every record must be processed.', 'Attachments, rows, contacts, orders, or files are iterated.', 'The same logic applies to each collection member.'],
  exclusionCriteria: ['Retrying one failed operation belongs to Retry.', 'Repeated outreach belongs to Follow-up Loop.', 'Repeated state checks belong to Polling Loop.', 'Feedback-driven changes belong to Revision Loop.', 'Repeating from an earlier checkpoint belongs to Return-to-step Loop.', 'A single object does not require Iterator.'],
  inputRequirements: [
    { id: 'source-collection', name: 'Source collection', description: 'The retrieved or produced collection containing multiple business items.', required: true, clarificationQuestion: 'Which collection supplies the items?' },
    { id: 'item-description', name: 'Item description', description: 'The meaning of one collection member.', required: true },
    { id: 'body-actions', name: 'Body actions', description: 'The business actions applied to every item.', required: true },
    { id: 'per-item-condition', name: 'Per-item condition', description: 'An optional condition evaluated for each item.', required: false },
    { id: 'aggregation-need', name: 'Aggregation requirement', description: 'An optional requirement to recombine item-level results.', required: false },
  ],
  outputRequirements: [
    { id: 'item-execution', name: 'Item-by-item execution', description: 'One repeated execution for each collection member.', minimumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'loop-body', name: 'Loop body', description: 'The actions performed for every item.', minimumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'completion-boundary', name: 'Collection completion boundary', description: 'The point after all required item processing finishes.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'aggregator-reference', name: 'Aggregator reference', description: 'An optional link to required result recombination.', minimumCount: 0, maximumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'require-collection', description: 'Require a real collection source.', reason: 'Iterator applies to multiple items, not one object.' },
    { id: 'preserve-retrieval', description: 'Preserve retrieval before iteration without duplicating it.', reason: 'The collection must exist before item processing begins.' },
    { id: 'notification-placement', description: 'Keep per-item notifications inside the body and completion notifications after completion.', reason: 'Notification placement changes business meaning.' },
    { id: 'optional-aggregation', description: 'Do not force Aggregator when recombination is not needed.', reason: 'Iteration can complete without producing one combined result.' },
    { id: 'exclude-other-loops', description: 'Distinguish Iterator from Retry and Follow-up Loop.', reason: 'Iterator repeats by collection membership rather than failure or communication state.' },
  ],
  positiveExamples: [
    { requirementText: 'For each email attachment, save the file.', expectedInterpretation: 'Iterate through the attachment collection and save each item.', valid: true },
    { requirementText: 'Process every invoice row and validate the amount.', expectedInterpretation: 'Apply validation to each invoice row.', valid: true },
    { requirementText: 'For each customer, calculate the renewal date.', expectedInterpretation: 'Apply the calculation to every customer.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Retry the upload three times.', expectedInterpretation: 'Use Retry.', valid: false },
    { requirementText: 'Follow up with the lead weekly.', expectedInterpretation: 'Use a Follow-up Loop.', valid: false },
    { requirementText: 'Check status until complete.', expectedInterpretation: 'Use a Polling Loop.', valid: false },
    { requirementText: 'Process the submitted invoice.', expectedInterpretation: 'Use a single Action.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['iterator', 'action', 'aggregator'], notes: ['Maps to WorkflowBriefIterator; aggregatorId remains optional.'],
};

export const aggregatorNodeFunctionContract: NodeFunctionContract = {
  id: 'aggregator', name: 'Aggregator', category: 'collection', status: 'detailed',
  purpose: 'Combine, collect, count, summarize, group, or otherwise recombine results produced from collection processing.',
  selectionCriteria: ['Collect processed item results.', 'Summarize all item outcomes.', 'Count matching records.', 'Group results by a business field.', 'Combine item-level outputs into one downstream result.'],
  exclusionCriteria: ['Branch synchronization belongs to Merge.', 'One-record field changes are data transformation.', 'Item-by-item processing belongs to Iterator.', 'Completion notification alone does not require combined data.', 'Generic combine wording without collection context is insufficient.'],
  inputRequirements: [
    { id: 'source-iterator', name: 'Source Iterator', description: 'The collection-processing boundary producing item results.', required: true },
    { id: 'aggregation-type', name: 'Aggregation type', description: 'Collect, summarize, count, group, or combine semantics.', required: true },
    { id: 'item-results', name: 'Item-level results', description: 'The outputs produced for individual collection items.', required: true },
    { id: 'output-description', name: 'Output description', description: 'The meaning and shape of the recombined business result.', required: true, clarificationQuestion: 'What combined result should collection processing produce?' },
    { id: 'downstream-target', name: 'Downstream target', description: 'The business action receiving the aggregated result.', required: true },
  ],
  outputRequirements: [
    { id: 'aggregated-result', name: 'Aggregated result', description: 'One collected, summarized, counted, grouped, or combined result.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'completion-boundary', name: 'Aggregation completion boundary', description: 'The point after required item results are recombined.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'target-step', name: 'Target business step', description: 'The next action receiving the aggregate.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'valid-iterator', description: 'Require a valid source Iterator.', reason: 'Aggregator recombines item-level results from collection processing.' },
    { id: 'not-automatic', description: 'Do not create Aggregator for every collection.', reason: 'Many collection workflows need no recombination.' },
    { id: 'paired-references', description: 'Preserve Iterator and Aggregator agreement.', reason: 'Both sides must identify the same collection boundary.' },
    { id: 'exclude-merge', description: 'Do not confuse Aggregator with Merge.', reason: 'Aggregator combines item results; Merge synchronizes branches.' },
    { id: 'completion-notification', description: 'Keep completion notifications after aggregation.', reason: 'Notification should receive the completed aggregate when required.' },
    { id: 'clarify-output', description: 'Request clarification when the desired aggregate is unclear.', reason: 'The recombined business result must be explicit.' },
  ],
  positiveExamples: [
    { requirementText: 'Collect all low-stock items into one report.', expectedInterpretation: 'Collect item-level low-stock results into one report.', valid: true },
    { requirementText: 'Count the number of failed records.', expectedInterpretation: 'Count failed item results.', valid: true },
    { requirementText: 'Group processed orders by region.', expectedInterpretation: 'Group item-level order results by region.', valid: true },
    { requirementText: 'Summarize all customer responses.', expectedInterpretation: 'Summarize the collection of response results.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Wait for both approval branches.', expectedInterpretation: 'Use Merge.', valid: false },
    { requirementText: 'For each item, validate the value.', expectedInterpretation: 'Use Iterator.', valid: false },
    { requirementText: 'Send a completion message.', expectedInterpretation: 'Use Notification.', valid: false },
    { requirementText: 'Combine first and last name.', expectedInterpretation: 'Use data transformation.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['aggregator', 'iterator', 'action'], notes: ['Maps to WorkflowBriefAggregator and requires agreement with its source Iterator.'],
};

export const triggerNodeFunctionContract: NodeFunctionContract = {
  id: 'trigger', name: 'Trigger', category: 'trigger', status: 'detailed',
  purpose: 'Define the business event, schedule, request, or manual start condition that begins a workflow execution.',
  selectionCriteria: ['A new event starts the process.', 'A schedule starts the process.', 'A form, message, file, record change, webhook, or manual action starts the process.', 'The requirement clearly identifies when execution begins.'],
  exclusionCriteria: ['Waiting inside an active workflow belongs to Wait.', 'Recurring outreach after start belongs to Follow-up Loop.', 'Repeated completion checks belong to Polling Loop.', 'An ordinary downstream operation belongs to Action.', 'A condition that routes an existing execution is not a Trigger.'],
  inputRequirements: [
    { id: 'trigger-subject', name: 'Trigger subject', description: 'The business event, request, record, or schedule that starts execution.', required: true },
    { id: 'trigger-type', name: 'Trigger type', description: 'Manual, schedule, event, webhook, form, message, file, record change, or other business start type.', required: true },
    { id: 'trigger-source', name: 'Source application or actor', description: 'The source context when explicitly relevant.', required: false },
    { id: 'start-description', name: 'Event or schedule description', description: 'The exact condition or cadence that starts execution.', required: true, clarificationQuestion: 'What exact event or schedule starts this workflow?' },
    { id: 'starting-context', name: 'Starting business context', description: 'The payload or business context available at start.', required: true },
  ],
  outputRequirements: [
    { id: 'start-boundary', name: 'Workflow start boundary', description: 'One explicit boundary beginning an execution.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'initial-context', name: 'Initial business payload', description: 'The business data or context supplied at start.', minimumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'first-step', name: 'First downstream step', description: 'The first Action or Decision after the start boundary.', minimumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'clear-start', description: 'Require at least one clear start condition.', reason: 'A workflow needs an unambiguous execution boundary.' },
    { id: 'not-every-event', description: 'Do not treat every event phrase as a new Trigger.', reason: 'Events may occur inside an already-running process.' },
    { id: 'schedule-versus-wait', description: 'Distinguish a schedule Trigger from internal Wait.', reason: 'A schedule begins execution while Wait pauses it.' },
    { id: 'event-versus-polling', description: 'Distinguish event-driven start from Polling Loop.', reason: 'Polling repeatedly checks after execution already exists.' },
    { id: 'preserve-source', description: 'Preserve explicitly named source application context.', reason: 'The source identifies where the start event originates.' },
    { id: 'clarify-primary', description: 'Clarify conflicting primary triggers and avoid multiple independent triggers unless explicit.', reason: 'The authoritative start boundary must be intentional.' },
  ],
  positiveExamples: [
    { requirementText: 'When a website enquiry is submitted, create a CRM lead.', expectedInterpretation: 'Start on website enquiry submission.', valid: true },
    { requirementText: 'Every Monday at 9 AM, prepare the weekly report.', expectedInterpretation: 'Start on the stated weekly schedule.', valid: true },
    { requirementText: 'When a new email arrives, save its attachments.', expectedInterpretation: 'Start when a new email arrives.', valid: true },
    { requirementText: 'Start manually when the operations manager approves the batch.', expectedInterpretation: 'Use an explicit manual start with approval context.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Wait three days before following up.', expectedInterpretation: 'Use Wait.', valid: false },
    { requirementText: 'Check every five minutes until complete.', expectedInterpretation: 'Use Polling Loop.', valid: false },
    { requirementText: 'If approved, continue.', expectedInterpretation: 'Use Binary Decision or Approval.', valid: false },
    { requirementText: 'Send a team notification.', expectedInterpretation: 'Use Action.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['trigger', 'application', 'actor', 'action', 'decision'], notes: ['Maps to WorkflowBriefTrigger and its business-level triggerType.'],
};

export const actionNodeFunctionContract: NodeFunctionContract = {
  id: 'action', name: 'Action', category: 'action', status: 'detailed',
  purpose: 'Represent one concrete business operation that changes, creates, retrieves, sends, records, updates, or otherwise advances the process.',
  selectionCriteria: ['The requirement states an explicit create, update, retrieve, send, record, calculate, validate, transform, notify, or comparable operation.', 'One clear operation has a defined subject and outcome.', 'The operation advances or changes workflow state.'],
  exclusionCriteria: ['A workflow start condition belongs to Trigger.', 'A routing or decision boundary is control flow.', 'Waiting belongs to Wait.', 'Collection repetition belongs to Iterator.', 'Branch synchronization or collection recombination is not Action.', 'Metadata or vague intent without an executable operation is insufficient.'],
  inputRequirements: [
    { id: 'operation', name: 'Operation', description: 'The concrete business verb or operation.', required: true, clarificationQuestion: 'What operation should the workflow perform?' },
    { id: 'business-subject', name: 'Business subject', description: 'The record, message, file, request, or other object acted upon.', required: true },
    { id: 'application-actor', name: 'Application or actor context', description: 'The application or responsible actor when relevant.', required: false },
    { id: 'required-inputs', name: 'Required inputs', description: 'The business data needed to perform the operation.', required: true },
    { id: 'expected-result', name: 'Expected outputs or result', description: 'The data or state produced by completion.', required: true },
  ],
  outputRequirements: [
    { id: 'completed-operation', name: 'Completed business operation', description: 'The result of one primary business operation.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'resulting-state', name: 'Resulting data or state', description: 'The business data or state after completion.', minimumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
    { id: 'downstream-context', name: 'Downstream context', description: 'The information available to the next step.', minimumCount: 1, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'one-operation', description: 'Keep one primary business operation per Action.', reason: 'Separate operations preserve clear intent and outputs.' },
    { id: 'no-vague-collapse', description: 'Do not collapse unrelated operations into one vague Action.', reason: 'Each operation needs traceable business meaning.' },
    { id: 'preserve-context', description: 'Preserve application and actor context.', reason: 'Context identifies where or by whom work occurs.' },
    { id: 'semantic-name', description: 'Do not use generic Perform action naming in a locked brief.', reason: 'A locked Action must state its business operation.' },
    { id: 'operation-distinctions', description: 'Distinguish explicit notification from ordinary delivery and validation from conversational checking.', reason: 'Similar verbs can represent different business functions.' },
    { id: 'clarify-object', description: 'Request clarification when the operation or object is unclear.', reason: 'Vague intent is not executable business meaning.' },
  ],
  positiveExamples: [
    { requirementText: 'Create a lead in the CRM.', expectedInterpretation: 'Create one lead record with application context.', valid: true },
    { requirementText: 'Retrieve the customer record.', expectedInterpretation: 'Retrieve one customer record.', valid: true },
    { requirementText: 'Validate the invoice fields.', expectedInterpretation: 'Validate the stated business fields.', valid: true },
    { requirementText: 'Notify the account manager.', expectedInterpretation: 'Send an explicit business notification.', valid: true },
    { requirementText: 'Record the result in the audit log.', expectedInterpretation: 'Record the result for audit history.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'When a form is submitted.', expectedInterpretation: 'Use Trigger.', valid: false },
    { requirementText: 'If the invoice is valid.', expectedInterpretation: 'Use Binary Decision.', valid: false },
    { requirementText: 'For each invoice.', expectedInterpretation: 'Use Iterator.', valid: false },
    { requirementText: 'Wait until the customer replies.', expectedInterpretation: 'Use Wait.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['action', 'application', 'actor'], notes: ['Maps to WorkflowBriefAction with explicit inputs and outputs.'],
};

export const filterNodeFunctionContract: NodeFunctionContract = {
  id: 'filter', name: 'Filter', category: 'decision', status: 'detailed',
  purpose: 'Allow only items or executions that meet a stated condition to continue while excluding or stopping those that do not.',
  selectionCriteria: ['Continue only when a condition is met.', 'Keep records matching criteria.', 'Ignore, skip, discard, or stop non-matching items.', 'One path continues while the other does not continue business processing.'],
  exclusionCriteria: ['Two meaningful continuing outcomes belong to Binary Decision.', 'Three or more outcomes belong to Router.', 'Collection repetition belongs to Iterator.', 'Validation whose result is used later without gating is Action.', 'Removing fields from an object is data transformation.'],
  inputRequirements: [
    { id: 'filter-subject', name: 'Filtered subject', description: 'The execution or collection item evaluated by the gate.', required: true },
    { id: 'filter-condition', name: 'Filter condition', description: 'The business criterion required for continuation.', required: true, clarificationQuestion: 'Which condition allows continuation?' },
    { id: 'matching-behavior', name: 'Matching behavior', description: 'The continuation when the condition matches.', required: true },
    { id: 'nonmatching-behavior', name: 'Non-matching behavior', description: 'The skip, discard, ignore, or stop outcome.', required: true },
    { id: 'filter-scope', name: 'Filter scope', description: 'Whether the gate applies to the entire execution or one collection item.', required: true },
  ],
  outputRequirements: [
    { id: 'allowed-continuation', name: 'Allowed continuation', description: 'The path for matching subjects.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'excluded-outcome', name: 'Excluded outcome', description: 'The skipped, discarded, ignored, or stopped non-match.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'condition-meaning', name: 'Semantic condition', description: 'The business meaning that distinguishes match from non-match.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'exclude-binary', description: 'Distinguish Filter from Binary Decision.', reason: 'Filter has one continuing path and one excluded outcome.' },
    { id: 'no-second-branch', description: 'Do not invent a second full business branch when non-match only stops or is discarded.', reason: 'A gate is intentionally one-sided.' },
    { id: 'preserve-scope', description: 'Preserve item-level versus whole-execution scope.', reason: 'Scope determines what is excluded.' },
    { id: 'exclude-adjectives', description: 'Do not infer filtering from descriptive adjectives alone.', reason: 'A Filter requires explicit gating behavior.' },
    { id: 'clarify-two-outcomes', description: 'Request clarification when both outcomes contain meaningful downstream work.', reason: 'That language may require Binary Decision instead.' },
  ],
  positiveExamples: [
    { requirementText: 'Continue only for invoices over $1,000.', expectedInterpretation: 'Allow matching invoices and stop non-matches.', valid: true },
    { requirementText: 'Ignore test submissions.', expectedInterpretation: 'Exclude test submissions from continuation.', valid: true },
    { requirementText: 'Keep only active customers.', expectedInterpretation: 'Allow active customer items only.', valid: true },
    { requirementText: 'Skip attachments that are not PDFs.', expectedInterpretation: 'Apply a per-item file-type gate.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'If approved, publish; otherwise return for revision.', expectedInterpretation: 'Use Binary Decision.', valid: false },
    { requirementText: 'Route by department.', expectedInterpretation: 'Use Router.', valid: false },
    { requirementText: 'Validate the invoice fields.', expectedInterpretation: 'Use Action.', valid: false },
    { requirementText: 'Remove the temporary field.', expectedInterpretation: 'Use data transformation.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['decision', 'route', 'action', 'iterator'], notes: ['A one-sided gate may be represented through decision and route entities without adding a dedicated Workflow Brief type.'],
};

export const errorHandlerNodeFunctionContract: NodeFunctionContract = {
  id: 'error-handler', name: 'Error Handler', category: 'resilience', status: 'detailed',
  purpose: 'Define the business response when an operation, branch, or workflow fails after normal handling or retries are exhausted.',
  selectionCriteria: ['Failure causes logging, alerting, escalation, compensation, routing, or stop behavior.', 'An unrecoverable error must be handled.', 'Cleanup or rollback is required.', 'A defined fallback continues after failure.', 'Handling occurs after retry exhaustion.'],
  exclusionCriteria: ['An ordinary negative business outcome is not an error.', 'Validation failure in normal flow belongs to a decision.', 'Immediate retry without final handling belongs to Retry.', 'Routine notification unrelated to failure belongs to Action.', 'Successful completion belongs to Terminal.'],
  inputRequirements: [
    { id: 'failure-source', name: 'Failure source', description: 'The operation, branch, or workflow scope that failed.', required: true, clarificationQuestion: 'Which operation or scope can fail?' },
    { id: 'failure-condition', name: 'Error or failure condition', description: 'The operational state that invokes final handling.', required: true },
    { id: 'handling-action', name: 'Handling action', description: 'The logging, alerting, compensation, cleanup, escalation, or fallback action.', required: true },
    { id: 'final-behavior', name: 'Continuation or stop behavior', description: 'The recovery, fallback, escalation, or termination after handling.', required: true },
    { id: 'retry-relationship', name: 'Retry exhaustion relationship', description: 'The attempt-exhaustion boundary when Retry precedes handling.', required: false },
  ],
  outputRequirements: [
    { id: 'handled-failure', name: 'Handled failure state', description: 'An explicit result showing the failure was handled.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'failure-path', name: 'Recovery or final failure path', description: 'The recovery, escalation, fallback, or termination outcome.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'error-context', name: 'Error context', description: 'Optional audit information required by the handling action.', minimumCount: 0, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'failure-versus-rejection', description: 'Distinguish operational failure from normal business rejection.', reason: 'Business decisions are not errors.' },
    { id: 'preserve-exhaustion', description: 'Preserve retry exhaustion before final handling.', reason: 'The handler should not bypass allowed recovery attempts.' },
    { id: 'no-swallow', description: 'Do not swallow errors without an explicit outcome.', reason: 'Failure handling must remain observable and traceable.' },
    { id: 'no-cycle', description: 'Avoid infinite Retry and Error Handler cycles.', reason: 'Final handling needs a safe outcome.' },
    { id: 'preserve-compensation', description: 'Preserve cleanup and compensation requirements.', reason: 'Failure may require reversing partial business effects.' },
    { id: 'clarify-owner', description: 'Request clarification when failure scope or owner is missing.', reason: 'Handling needs a defined responsibility boundary.' },
  ],
  positiveExamples: [
    { requirementText: 'After three failed API attempts, alert operations and stop.', expectedInterpretation: 'Handle retry exhaustion through alert and terminal failure.', valid: true },
    { requirementText: 'If file processing fails, log the error and move the file to the review queue.', expectedInterpretation: 'Record failure and continue through a review fallback.', valid: true },
    { requirementText: 'On payment failure, release the reservation and notify the customer.', expectedInterpretation: 'Compensate the reservation and communicate failure.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'If the customer rejects the offer, close the lead.', expectedInterpretation: 'Use a normal business outcome.', valid: false },
    { requirementText: 'Retry the request twice.', expectedInterpretation: 'Use Retry.', valid: false },
    { requirementText: 'Notify the sales team about a new lead.', expectedInterpretation: 'Use Action.', valid: false },
    { requirementText: 'End the workflow successfully.', expectedInterpretation: 'Use Terminal.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['capability', 'action', 'loop', 'route'], notes: ['Remains a conceptual capability where no dedicated Workflow Brief error entity exists.'],
};

export const subWorkflowNodeFunctionContract: NodeFunctionContract = {
  id: 'sub-workflow', name: 'Sub-workflow', category: 'orchestration', status: 'detailed',
  purpose: 'Delegate a coherent, reusable business process to another defined workflow and continue with its result or completion state.',
  selectionCriteria: ['A reusable process is invoked.', 'Another workflow or subprocess is called.', 'A named business capability is delegated.', 'The same multi-step process is reused by multiple workflows.', 'A coherent process has clear inputs and outputs.'],
  exclusionCriteria: ['One ordinary operation belongs to Action.', 'Vague separate-automation wording is insufficient.', 'A parallel branch in the same workflow is not delegation.', 'One external application operation is Action.', 'Returning inside the same workflow belongs to Return-to-step Loop.'],
  inputRequirements: [
    { id: 'process-purpose', name: 'Delegated process name or purpose', description: 'The coherent reusable business process being invoked.', required: true, clarificationQuestion: 'Which defined reusable process should be invoked?' },
    { id: 'process-inputs', name: 'Required inputs', description: 'The business context passed to the delegated process.', required: true },
    { id: 'process-outputs', name: 'Expected outputs', description: 'The result or completion state returned to the caller.', required: true },
    { id: 'success-behavior', name: 'Success behavior', description: 'The caller continuation after successful completion.', required: true },
    { id: 'failure-behavior', name: 'Failure behavior', description: 'The caller handling when delegation fails.', required: true },
    { id: 'wait-behavior', name: 'Completion waiting behavior', description: 'Whether the caller waits for completion when relevant.', required: false },
  ],
  outputRequirements: [
    { id: 'invocation-boundary', name: 'Subprocess invocation boundary', description: 'The explicit delegation from caller to reusable process.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'returned-result', name: 'Returned result or completion state', description: 'The business result returned to the caller.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'caller-paths', name: 'Continuation or failure path', description: 'The caller outcomes after delegated completion.', minimumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'coherent-process', description: 'Require a coherent reusable process, not one operation.', reason: 'Sub-workflow delegation needs a meaningful process boundary.' },
    { id: 'clear-contract', description: 'Define clear input and output boundaries.', reason: 'Caller and delegated process must share a stable business contract.' },
    { id: 'no-circular-call', description: 'Avoid circular workflow invocation.', reason: 'Circular delegation cannot reach a safe completion.' },
    { id: 'no-complexity-inference', description: 'Do not infer a separate workflow solely from complexity.', reason: 'Delegation must be an explicit or reviewed architecture need.' },
    { id: 'preserve-ownership', description: 'Preserve ownership between caller and delegated process.', reason: 'Each process must have a clear responsibility boundary.' },
    { id: 'clarify-existence', description: 'Request clarification when the delegated process or its contract is unclear.', reason: 'An undefined subprocess cannot be invoked conceptually.' },
  ],
  positiveExamples: [
    { requirementText: 'Run the reusable customer-enrichment workflow and return the enriched profile.', expectedInterpretation: 'Delegate enrichment and return its profile result.', valid: true },
    { requirementText: 'Call the employee-provisioning subprocess after approval.', expectedInterpretation: 'Invoke the named provisioning process.', valid: true },
    { requirementText: 'Use the shared invoice-validation workflow for every submitted invoice.', expectedInterpretation: 'Delegate reusable invoice validation with item context.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Create a CRM contact.', expectedInterpretation: 'Use Action.', valid: false },
    { requirementText: 'Process each invoice.', expectedInterpretation: 'Use Iterator.', valid: false },
    { requirementText: 'Return to qualification.', expectedInterpretation: 'Use Return-to-step Loop.', valid: false },
    { requirementText: 'Send tasks to Finance and Legal.', expectedInterpretation: 'Use parallel branches or routing.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['capability', 'action'], notes: ['Remains a conceptual capability without execution identifiers or endpoints.'],
};

export const terminalNodeFunctionContract: NodeFunctionContract = {
  id: 'terminal', name: 'Terminal', category: 'terminal', status: 'detailed',
  purpose: 'Represent an explicit business completion, stop, rejection, cancellation, failure, or other final outcome with no further workflow continuation.',
  selectionCriteria: ['The process completes successfully.', 'The process closes, stops, ends, rejects, cancels, archives, or terminates.', 'A final business outcome is recorded.', 'An unrecoverable failure stops execution.', 'A branch explicitly finishes.'],
  exclusionCriteria: ['Temporary pause belongs to Wait.', 'Merge followed by more work is not Terminal.', 'A notification that continues is Action.', 'Recoverable failure belongs to Error Handler.', 'A loop exit followed by another action is not Terminal.', 'An ordinary Action without finality is not Terminal.'],
  inputRequirements: [
    { id: 'outcome-type', name: 'Final outcome type', description: 'Success, failure, rejected, cancelled, completed, or another terminal meaning.', required: true },
    { id: 'terminal-reason', name: 'Completion or termination reason', description: 'The business reason the process ends.', required: true, clarificationQuestion: 'What final business outcome ends this path?' },
    { id: 'final-state', name: 'Final business state', description: 'The state recorded when no continuation remains.', required: true },
    { id: 'preterminal-work', name: 'Final notification or recordkeeping', description: 'Optional business work completed immediately before termination.', required: false },
  ],
  outputRequirements: [
    { id: 'final-state', name: 'Explicit final state', description: 'One terminal business state with semantic meaning.', minimumCount: 1, maximumCount: 1, semanticLabelRequired: true, genericLabelsAllowed: false },
    { id: 'outgoing-continuation', name: 'Outgoing continuation', description: 'No downstream continuation is permitted after Terminal.', minimumCount: 0, maximumCount: 0, semanticLabelRequired: false, genericLabelsAllowed: false },
  ],
  safeguards: [
    { id: 'no-continuation', description: 'Terminal entities must not have downstream continuation.', reason: 'Terminal represents finality.' },
    { id: 'failure-versus-recovery', description: 'Distinguish failure Terminal from recoverable Error Handler.', reason: 'Recoverable handling continues while Terminal does not.' },
    { id: 'preserve-branch-outcome', description: 'Preserve branch-specific final outcomes.', reason: 'Different paths may end with different business states.' },
    { id: 'semantic-finality', description: 'Do not use generic End when the business outcome is known.', reason: 'The terminal label must explain completion meaning.' },
    { id: 'not-middle', description: 'Avoid accidental Terminal in the middle of a process.', reason: 'Any later action contradicts finality.' },
    { id: 'clarify-finish', description: 'Request clarification when finish is stated but later steps remain.', reason: 'The actual terminal boundary is ambiguous.' },
  ],
  positiveExamples: [
    { requirementText: 'Close the lead as not interested.', expectedInterpretation: 'End the path with a Not Interested state.', valid: true },
    { requirementText: 'Mark the onboarding process complete.', expectedInterpretation: 'End with a Completed state.', valid: true },
    { requirementText: 'Cancel the request and stop.', expectedInterpretation: 'End with a Cancelled state.', valid: true },
    { requirementText: 'After retry exhaustion, record failure and terminate.', expectedInterpretation: 'Record final failure and end with no continuation.', valid: true },
  ],
  negativeExamples: [
    { requirementText: 'Wait until the customer replies.', expectedInterpretation: 'Use Wait.', valid: false },
    { requirementText: 'Log the error and continue through fallback processing.', expectedInterpretation: 'Use Error Handler.', valid: false },
    { requirementText: 'Merge the approval branches, then create the contract.', expectedInterpretation: 'Use Merge followed by Action.', valid: false },
    { requirementText: 'Send the final notification, then archive the record.', expectedInterpretation: 'Continue through another Action before finality.', valid: false },
  ],
  relatedWorkflowBriefEntityTypes: ['capability', 'action', 'route', 'loop'], notes: ['Terminal remains a conceptual capability or semantically final Action where no dedicated Workflow Brief entity exists.'],
};

type FoundationSeed = { id: string; name: string; category: NodeFunctionCategory; entities: NodeFunctionContract['relatedWorkflowBriefEntityTypes'] };
const foundationSeeds: FoundationSeed[] = [
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
  waitNodeFunctionContract,
  approvalNodeFunctionContract,
  mergeNodeFunctionContract,
  iteratorNodeFunctionContract,
  aggregatorNodeFunctionContract,
  triggerNodeFunctionContract,
  actionNodeFunctionContract,
  filterNodeFunctionContract,
  errorHandlerNodeFunctionContract,
  subWorkflowNodeFunctionContract,
  terminalNodeFunctionContract,
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
