import { structuredWorkflowPlanSchema, v22ConceptualGraphResultSchema, type P3BusinessIntentOutput, type PlannerContext, type StructuredWorkflowPlan, type V21AnalysisArtifacts, type V22ConceptualGraphResult } from '@awm/shared';
import { validatePlannerGraph, validateV22ConceptualGraph, type PlannerGraphIssue } from './planner-graph-validator.js';
import { V22ConceptualGraphBuilder } from './v2-conceptual-graph-builder.js';

type Node = StructuredWorkflowPlan['nodes'][number];
type Edge = StructuredWorkflowPlan['edges'][number];

export interface SkeletonCompilationResult {
  plan: StructuredWorkflowPlan;
  issues: PlannerGraphIssue[];
  appliedPatterns: string[];
  compilerVersion: '1.0.0';
  durationMs: number;
}

class GraphBuilder {
  public readonly nodes: Node[] = [];
  public readonly edges: Edge[] = [];
  public readonly binaryConditions: StructuredWorkflowPlan['binaryConditions'] = [];
  public readonly routers: StructuredWorkflowPlan['routers'] = [];
  public readonly merges: StructuredWorkflowPlan['merges'] = [];
  public readonly loops: StructuredWorkflowPlan['loops'] = [];
  public readonly retries: StructuredWorkflowPlan['retries'] = [];
  private nodeSequence = 0;
  private edgeSequence = 0;

  public constructor(private readonly context: PlannerContext) {}

  public node(canonicalFunctionId: string, title: string, patternIds: string[] = [], blockers: string[] = []): Node {
    const relevantFacts = this.context.facts.filter((fact) => fact.value === canonicalFunctionId || this.matchesTitle(fact.value, title));
    const factIds = relevantFacts.length ? relevantFacts.map((fact) => fact.id) : this.context.facts.slice(0, 1).map((fact) => fact.id);
    const node: Node = {
      id: `p4-node-${String(++this.nodeSequence).padStart(3, '0')}`,
      canonicalFunctionId, title, applicationRef: null, operationRef: null, inputs: ['previous-step-data'],
      outputs: canonicalFunctionId === 'end' ? [] : ['step-result'], factIds,
      patternIds: patternIds.filter((id) => this.context.patterns.some((pattern) => pattern.id === id)),
      knowledgeIds: [], capabilityIds: [], blockedByClarificationIds: blockers,
      limitationAcknowledgements: [],
    };
    this.nodes.push(node);
    return node;
  }

  public edge(source: Node, target: Node, label = 'NEXT', condition: string | null = null, ruleId = 'p4.sequence'): Edge {
    const evidenceIds = this.evidenceFor(source, target);
    const edge: Edge = {
      id: `p4-edge-${String(++this.edgeSequence).padStart(3, '0')}`, source: source.id, target: target.id,
      condition, label, purpose: `${label} transition from ${source.title} to ${target.title}.`,
      businessReason: condition ?? `Continue after ${source.title}.`, ruleId, evidenceIds,
    };
    this.edges.push(edge);
    return edge;
  }

  private evidenceFor(source: Node, target: Node): string[] {
    const factIds = new Set([...source.factIds, ...target.factIds]);
    const referenced = this.context.facts.filter((fact) => factIds.has(fact.id)).flatMap((fact) => fact.evidenceIds);
    return [...new Set(referenced)].slice(0, 4).length ? [...new Set(referenced)].slice(0, 4) : this.context.evidence.slice(0, 1).map((item) => item.id);
  }

  private matchesTitle(value: string, title: string): boolean {
    const normalized = value.toLowerCase().replaceAll('-', ' ');
    return normalized.length > 3 && title.toLowerCase().includes(normalized);
  }
}

export class DeterministicSkeletonCompiler {
  public compileV22(artifacts: V21AnalysisArtifacts): V22ConceptualGraphResult {
    const graph = new V22ConceptualGraphBuilder().build(artifacts);
    const issues = validateV22ConceptualGraph(graph);
    return v22ConceptualGraphResultSchema.parse({ graph, validation: { valid: issues.length === 0, issues } });
  }

  public compile(context: PlannerContext, intent: P3BusinessIntentOutput | null = null): SkeletonCompilationResult {
    const started = performance.now();
    const graph = new GraphBuilder(context);
    const appliedPatterns: string[] = [];
    const patternIds = new Set(context.patterns.map((pattern) => pattern.id));
    const scope = context.objective.toLowerCase();
    if (patternIds.has('follow-up-until-response') && !/follow[ -]?up|remind|until (?:response|(?:the )?(?:lead |client )?respond)/.test(scope)) patternIds.delete('follow-up-until-response');
    if (/follow[ -]?up[\s\S]{0,80}until (?:response|(?:the )?(?:lead |client )?respond)/.test(scope)) patternIds.add('follow-up-until-response');
    if (/create (?:it |the \w+ )?when absent|create or update|update (?:it |the \w+ )?when present/.test(scope)) patternIds.add('create-or-update-record');
    if (/(?:three|3) service types|route to [^.;]+, [^.;]+, or /.test(scope)) patternIds.add('service-based-routing');
    if (/(?:(?:after|upon|once|request|human)\s+approv\w*|(?:manager|human|reviewer)\s+approv\w*|approval)[\s\S]{0,80}(?:collection|attachments|each|every|all )/.test(scope)) patternIds.add('process-approved-collection');
    if (/(?:each|every|all )\s*(?:attachment|file|entry|item)/.test(scope)) patternIds.add('collection-processing');
    if (/remind|reminder/.test(scope) && /daily|weekly|monthly|every \d+|schedule/.test(scope)) patternIds.add('scheduled-reminder');
    const blockers = context.clarifications.map((item) => item.id);
    const trigger = graph.node('trigger', intent?.workflowBoundaryCandidates[0]?.title ?? 'Workflow trigger');
    let tail = trigger;

    const apply = (patternId: string, compiler: () => Node) => {
      appliedPatterns.push(patternId);
      tail = compiler();
    };

    if (patternIds.has('follow-up-until-response')) apply('follow-up-until-response', () => this.followUp(graph, tail, blockers));
    if (patternIds.has('create-or-update-record') || patternIds.has('deduplicate-before-create')) {
      apply(patternIds.has('create-or-update-record') ? 'create-or-update-record' : 'deduplicate-before-create', () => this.createOrUpdate(graph, tail, blockers));
    }
    if (patternIds.has('process-approved-collection')) apply('process-approved-collection', () => this.approvedCollection(graph, tail, blockers));
    else if (patternIds.has('collection-processing')) apply('collection-processing', () => this.collectionProcessing(graph, tail, blockers, context));
    if (patternIds.has('scheduled-reminder')) apply('scheduled-reminder', () => this.scheduledReminder(graph, tail, blockers));
    if (patternIds.has('service-based-routing')) apply('service-based-routing', () => this.serviceRouting(graph, tail, blockers, context));

    if (!appliedPatterns.length) tail = this.compileDetectedFunctions(graph, tail, blockers, context);
    const end = graph.node(blockers.length ? 'end' : 'end', blockers.length ? 'Blocked pending clarification' : 'Workflow complete', [], blockers);
    if (tail.id !== end.id) graph.edge(tail, end, blockers.length ? 'BLOCKED' : 'COMPLETE', blockers.length ? 'Required clarification is unresolved.' : null, 'p4.termination');

    const plan = structuredWorkflowPlanSchema.parse({
      version: '1.1', objective: intent?.businessObjective ?? context.objective, platform: context.platform,
      entryNodeId: trigger.id, nodes: graph.nodes, edges: graph.edges,
      binaryConditions: graph.binaryConditions, routers: graph.routers, merges: graph.merges,
      loops: graph.loops, retries: graph.retries, blockedByClarificationIds: blockers,
      warnings: blockers.map((id) => `Planning remains blocked by ${id}; no policy was invented.`),
    });
    return {
      plan,
      issues: [...validatePlannerGraph(plan, context), ...this.validateCompilerInvariants(plan)],
      appliedPatterns,
      compilerVersion: '1.0.0',
      durationMs: Number((performance.now() - started).toFixed(2)),
    };
  }

  private followUp(graph: GraphBuilder, previous: Node, blockers: string[]): Node {
    const pattern = ['follow-up-until-response'];
    const loop = graph.node('loop', 'Follow up until response', pattern, blockers.filter((id) => /interval|attempt|escalation|channel/.test(id)));
    const entry = graph.edge(previous, loop, 'LOOP ENTRY', null, 'pattern.follow-up.entry');
    const send = graph.node('notification', 'Send follow-up message', pattern, blockers.filter((id) => /channel/.test(id)));
    graph.edge(loop, send, 'ITERATION', 'Lead has not responded and stop boundary is not reached.', 'pattern.follow-up.body');
    const wait = graph.node('delay', 'Wait for configured follow-up interval', pattern, blockers.filter((id) => /interval/.test(id)));
    graph.edge(send, wait, 'WAIT', null, 'pattern.follow-up.delay');
    graph.edge(wait, loop, 'LOOP BACK', 'Continue only while no response and within the configured attempt limit.', 'pattern.follow-up.back');
    const continuation = graph.node('data-transformation', 'Continue after response or bounded stop', pattern);
    const exit = graph.edge(loop, continuation, 'LOOP EXIT', 'Lead responded or the configured stop boundary was reached.', 'pattern.follow-up.exit');
    graph.loops.push({ nodeId: loop.id, entryEdgeId: entry.id, bodyEntryNodeId: send.id, bodyExitNodeId: wait.id, exitEdgeId: exit.id, terminationCondition: blockers.length ? 'Blocked until interval, attempt limit, and escalation policy are supplied.' : 'Response received or configured boundary reached.' });
    return continuation;
  }

  private createOrUpdate(graph: GraphBuilder, previous: Node, blockers: string[]): Node {
    const pattern = ['create-or-update-record'];
    const search = graph.node('data-retrieval', 'Search for existing record', pattern, blockers.filter((id) => /duplicate/.test(id)));
    graph.edge(previous, search, 'SEARCH', null, 'pattern.upsert.search');
    const decision = graph.node('binary-condition', 'Does the record already exist?', pattern);
    graph.edge(search, decision, 'EVALUATE', null, 'pattern.upsert.decision');
    const update = graph.node('action', 'Update existing record', pattern);
    const create = graph.node('action', 'Create new record', pattern);
    const trueEdge = graph.edge(decision, update, 'TRUE', 'Matching record exists.', 'pattern.upsert.true');
    const falseEdge = graph.edge(decision, create, 'FALSE', 'No matching record exists.', 'pattern.upsert.false');
    graph.binaryConditions.push({ nodeId: decision.id, trueEdgeId: trueEdge.id, falseEdgeId: falseEdge.id });
    const merge = graph.node('merge', 'Rejoin create and update paths', pattern);
    const updateIn = graph.edge(update, merge, 'UPDATED', null, 'pattern.upsert.merge');
    const createIn = graph.edge(create, merge, 'CREATED', null, 'pattern.upsert.merge');
    const continuation = graph.node('data-transformation', 'Continue with resolved record', pattern);
    const continuationEdge = graph.edge(merge, continuation, 'CONTINUE', null, 'pattern.upsert.continue');
    graph.merges.push({ nodeId: merge.id, incomingBranches: [updateIn.id, createIn.id], mergeStrategy: 'first_available', continuationEdgeId: continuationEdge.id });
    return continuation;
  }

  private approvedCollection(graph: GraphBuilder, previous: Node, blockers: string[]): Node {
    const pattern = ['process-approved-collection'];
    const approval = graph.node('human-approval', 'Request human approval', pattern, blockers.filter((id) => /approval/.test(id)));
    graph.edge(previous, approval, 'REQUEST APPROVAL', null, 'pattern.collection.approval');
    const decision = graph.node('binary-condition', 'Was the collection approved?', pattern);
    graph.edge(approval, decision, 'DECIDE', null, 'pattern.collection.decision');
    const iterator = graph.node('iterator', 'Iterate approved collection', pattern);
    const rejected = graph.node('manual-review', 'Handle rejected collection', pattern);
    const approvedEdge = graph.edge(decision, iterator, 'TRUE', 'Approval granted.', 'pattern.collection.approved');
    const rejectedEdge = graph.edge(decision, rejected, 'FALSE', 'Approval rejected.', 'pattern.collection.rejected');
    graph.binaryConditions.push({ nodeId: decision.id, trueEdgeId: approvedEdge.id, falseEdgeId: rejectedEdge.id });
    const item = graph.node('action', 'Process current collection item', pattern);
    graph.edge(iterator, item, 'ITEM', 'For each approved item.', 'pattern.collection.item');
    graph.edge(item, iterator, 'NEXT ITEM', 'More collection items remain.', 'pattern.collection.next');
    const aggregate = graph.node('aggregator', 'Aggregate item results', pattern);
    graph.edge(iterator, aggregate, 'ITERATION COMPLETE', 'All approved items have been processed.', 'pattern.collection.aggregate');
    const merge = graph.node('merge', 'Rejoin approved and rejected outcomes', pattern);
    const approvedIn = graph.edge(aggregate, merge, 'APPROVED COMPLETE', null, 'pattern.collection.merge');
    const rejectedIn = graph.edge(rejected, merge, 'REJECTED COMPLETE', null, 'pattern.collection.merge');
    const continuation = graph.node('notification', 'Notify collection processing result', pattern);
    const continuationEdge = graph.edge(merge, continuation, 'CONTINUE', null, 'pattern.collection.continue');
    graph.merges.push({ nodeId: merge.id, incomingBranches: [approvedIn.id, rejectedIn.id], mergeStrategy: 'first_available', continuationEdgeId: continuationEdge.id });
    return continuation;
  }

  private scheduledReminder(graph: GraphBuilder, previous: Node, blockers: string[]): Node {
    const pattern = ['scheduled-reminder'];
    const delay = graph.node('delay', 'Wait until reminder schedule', pattern, blockers.filter((id) => /interval|timing/.test(id)));
    graph.edge(previous, delay, 'WAIT', null, 'pattern.reminder.delay');
    const notify = graph.node('notification', 'Send scheduled reminder', pattern);
    graph.edge(delay, notify, 'REMIND', 'Configured schedule reached.', 'pattern.reminder.notify');
    return notify;
  }

  private collectionProcessing(graph: GraphBuilder, previous: Node, blockers: string[], context: PlannerContext): Node {
    const pattern = ['collection-processing'];
    const functions = new Set(context.facts.filter((fact) => fact.kind === 'workflow_function').map((fact) => fact.value));
    const itemScopedNotification = /\b(?:for each|for every)\s+[a-z][a-z-]*\s*,?\s*(?:notify|alert|inform|send\s+(?:a\s+)?(?:notification|alert|notice))\b|\b(?:notify|alert|inform|send\s+(?:a\s+)?(?:notification|alert|notice))\b[^.;]{0,60}\b(?:for each|per)\s+[a-z][a-z-]*/i.test(context.objective)
      && !/\b(?:after|once|when)\b[^.;]{0,80}\b(?:processing|iteration|collection|aggregation)\b[^.;]{0,40}\b(?:complete|completed|finishes|finished|done)\b/i.test(context.objective);
    let entry = previous;
    if (functions.has('data-retrieval')) {
      const retrieval = graph.node('data-retrieval', this.functionEvidenceTitle(context, 'data-retrieval', 'Retrieve collection for processing'), pattern);
      graph.edge(entry, retrieval, 'RETRIEVE COLLECTION', null, 'pattern.collection.retrieve');
      entry = retrieval;
    }
    const iterator = graph.node('iterator', 'Iterate collection', pattern, blockers.filter((id) => /cardinality/.test(id)));
    graph.edge(entry, iterator, 'ITERATE', null, 'pattern.collection.entry');
    let itemTail = graph.node('action', 'Process current item', pattern);
    graph.edge(iterator, itemTail, 'ITEM', 'A collection item is available.', 'pattern.collection.item');
    if (functions.has('delay')) {
      const delay = graph.node('delay', this.delayTitle(context), pattern, blockers.filter((id) => /timing|interval/.test(id)));
      graph.edge(itemTail, delay, 'WAIT', null, 'pattern.collection.delay');
      itemTail = delay;
    }
    if (functions.has('notification') && itemScopedNotification) {
      const notification = graph.node('notification', this.functionEvidenceTitle(context, 'notification', 'Send notification for current item'), pattern);
      graph.edge(itemTail, notification, 'NOTIFY', null, 'pattern.collection.notify');
      itemTail = notification;
    }
    if (functions.has('logging')) {
      const logging = graph.node('logging', 'Log current item result', pattern);
      graph.edge(itemTail, logging, 'LOG', null, 'pattern.collection.log');
      itemTail = logging;
    }
    graph.edge(itemTail, iterator, 'NEXT ITEM', 'More items remain.', 'pattern.collection.next');
    let collectionTail: Node = iterator;
    if (functions.has('aggregator')) {
      const aggregate = graph.node('aggregator', 'Aggregate item results', pattern);
      graph.edge(iterator, aggregate, 'ITERATION COMPLETE', 'No collection items remain.', 'pattern.collection.complete');
      collectionTail = aggregate;
    } else {
      const completion = graph.node('data-transformation', 'Collection processing complete', pattern);
      graph.edge(iterator, completion, 'DONE', 'No collection items remain.', 'pattern.collection.complete');
      collectionTail = completion;
    }
    if (functions.has('notification') && !itemScopedNotification) {
      const notification = graph.node('notification', this.functionEvidenceTitle(context, 'notification', 'Send collection completion notification'), pattern);
      graph.edge(collectionTail, notification, 'NOTIFY', 'Collection processing is complete.', 'pattern.collection.notify-complete');
      collectionTail = notification;
    }
    const aggregatorPosition = this.firstEvidencePosition(context, 'aggregator');
    const actionAfterAggregator = context.facts.some((fact) => fact.kind === 'workflow_function' && fact.value === 'action' && this.factPosition(context, fact) > aggregatorPosition);
    if (!functions.has('aggregator') || !actionAfterAggregator) return collectionTail;
    const action = graph.node('action', 'Perform action with aggregated results', pattern);
    graph.edge(collectionTail, action, 'USE AGGREGATED RESULT', null, 'pattern.collection.aggregated-action');
    return action;
  }

  private serviceRouting(graph: GraphBuilder, previous: Node, blockers: string[], context: PlannerContext): Node {
    const pattern = ['service-based-routing'];
    const router = graph.node('multi-route-decision', 'Route by service type', pattern);
    graph.edge(previous, router, 'ROUTE', null, 'pattern.service.entry');
    const routeFacts = context.facts.filter((fact) => fact.kind === 'route').map((fact) => fact.value);
    const labels = [...new Set(routeFacts.length >= 3 ? routeFacts.slice(0, 8) : ['Cleaning', 'Maintenance', 'Repair'])];
    const actions = labels.map((label) => graph.node('action', `Handle ${label} service`, pattern));
    const routes = actions.map((action, index) => {
      const label = labels[index]!;
      const edge = graph.edge(router, action, label, `Service type is ${label}.`, 'pattern.service.route');
      return { label, condition: `serviceType = ${label}`, destination: action.id, edgeId: edge.id };
    });
    graph.routers.push({ nodeId: router.id, routes });
    const merge = graph.node('merge', 'Rejoin service routes', pattern);
    const incoming = actions.map((action) => graph.edge(action, merge, 'ROUTE COMPLETE', null, 'pattern.service.merge').id);
    const continuation = graph.node('logging', 'Log routed service result', pattern, blockers);
    const continuationEdge = graph.edge(merge, continuation, 'CONTINUE', null, 'pattern.service.continue');
    graph.merges.push({ nodeId: merge.id, incomingBranches: incoming, mergeStrategy: 'first_available', continuationEdgeId: continuationEdge.id });
    return continuation;
  }

  private compileDetectedFunctions(graph: GraphBuilder, previous: Node, blockers: string[], context: PlannerContext): Node {
    let tail = previous;
    const functionFacts = context.facts
      .filter((fact) => fact.kind === 'workflow_function')
      .sort((left, right) => this.factPosition(context, left) - this.factPosition(context, right));
    const functions = functionFacts.map((fact) => fact.value);
    if (functions.includes('iterator')) return this.collectionProcessing(graph, tail, blockers, context);
    const seenControls = new Set<string>();
    const binaryBranches = this.binaryBranches(context.objective);
    for (const functionId of functions) {
      if (functionId === 'trigger' || functionId === 'end') continue;
      if (!['action', 'notification', 'logging', 'data-retrieval', 'delay'].includes(functionId)) {
        if (seenControls.has(functionId)) continue;
        seenControls.add(functionId);
      }
      if (functionId === 'loop') {
        if (/\bretry\b/i.test(context.objective) && !/follow[ -]?up|remind|until (?:response|(?:the )?(?:lead |client )?respond)/i.test(context.objective)) continue;
        if (functions.includes('delay') && !/\bfollow[ -]?up\b|\bremind(?:er)?\b|\brepeat\b/i.test(context.objective)) continue;
        tail = this.followUp(graph, tail, blockers);
      } else if (functionId === 'multi-route-decision') {
        tail = this.serviceRouting(graph, tail, blockers, context);
      } else if (functionId === 'retry') {
        tail = this.technicalRetry(graph, tail, blockers, context.objective);
      } else if (functionId === 'human-approval') {
        tail = this.approvalFlow(graph, tail, blockers);
      } else if (functionId === 'binary-condition') {
        const decision = graph.node('binary-condition', 'Evaluate business condition', [], blockers.filter((id) => /false-path|condition/.test(id)));
        graph.edge(tail, decision, 'EVALUATE', null, 'fact.binary.entry');
        const yes = graph.node('action', binaryBranches?.positive ?? 'Handle TRUE outcome');
        const no = graph.node('manual-review', binaryBranches?.alternate ?? 'Handle FALSE outcome', [], blockers.filter((id) => /false-path/.test(id)));
        const trueEdge = graph.edge(decision, yes, 'TRUE', binaryBranches ? `${binaryBranches.condition}: ${binaryBranches.positive}` : 'Condition is true.', 'fact.binary.true');
        const falseEdge = graph.edge(decision, no, 'FALSE', binaryBranches ? `Otherwise: ${binaryBranches.alternate}` : 'Condition is false.', 'fact.binary.false');
        graph.binaryConditions.push({ nodeId: decision.id, trueEdgeId: trueEdge.id, falseEdgeId: falseEdge.id });
        const merge = graph.node('merge', 'Rejoin condition outcomes');
        const yesIn = graph.edge(yes, merge, 'TRUE COMPLETE', null, 'fact.binary.merge');
        const noIn = graph.edge(no, merge, 'FALSE COMPLETE', null, 'fact.binary.merge');
        const continuation = graph.node('data-transformation', 'Continue after condition');
        const continuationEdge = graph.edge(merge, continuation, 'CONTINUE', null, 'fact.binary.continue');
        graph.merges.push({ nodeId: merge.id, incomingBranches: [yesIn.id, noIn.id], mergeStrategy: 'first_available', continuationEdgeId: continuationEdge.id });
        tail = continuation;
      } else {
        const title = functionId === 'delay' ? this.delayTitle(context)
          : functionId === 'aggregator' ? 'Aggregate collection results'
            : `Perform ${functionId.replaceAll('-', ' ')}`;
        const next = graph.node(functionId, title, [], blockers);
        graph.edge(tail, next);
        tail = next;
      }
    }
    if (tail === previous) {
      const action = graph.node('action', 'Perform requested business action', [], blockers);
      graph.edge(previous, action);
      return action;
    }
    return tail;
  }

  private binaryBranches(scope: string): { condition: string; positive: string; alternate: string } | null {
    const conditional = /\b(?:if|when)\s+([^,.;]{1,100}),\s*([^.;]{1,120})[.;]\s*(?:otherwise|else|if\s+not)\s*,?\s*([^.;]{1,120})/i.exec(scope);
    if (conditional) return { condition: conditional[1]!.trim(), positive: conditional[2]!.trim(), alternate: conditional[3]!.trim() };
    const leadingAction = /\b((?:process|save|create|send|notify|archive|continue|end|update|publish)\b[^,.;]{1,120}),\s*otherwise\s+([^.;]{1,120})/i.exec(scope);
    if (leadingAction) return { condition: leadingAction[1]!.trim(), positive: leadingAction[1]!.trim(), alternate: leadingAction[2]!.trim() };
    return null;
  }

  private factPosition(context: PlannerContext, fact: PlannerContext['facts'][number]): number {
    return Math.min(...fact.evidenceIds.map((id) => context.evidence.find((item) => item.id === id)?.sourceStart ?? Number.MAX_SAFE_INTEGER));
  }

  private firstEvidencePosition(context: PlannerContext, functionId: string): number {
    const positions = context.facts
      .filter((fact) => fact.kind === 'workflow_function' && fact.value === functionId)
      .map((fact) => this.factPosition(context, fact));
    return positions.length ? Math.min(...positions) : Number.MAX_SAFE_INTEGER;
  }

  private functionEvidenceTitle(context: PlannerContext, functionId: string, fallback: string): string {
    const functionFact = context.facts.find((fact) => fact.kind === 'workflow_function' && fact.value === functionId);
    const evidence = functionFact?.evidenceIds.map((id) => context.evidence.find((item) => item.id === id)).find(Boolean);
    const title = evidence?.text.trim() || fallback;
    if (functionId !== 'data-retrieval' || !functionFact) return title;
    const functionPosition = this.factPosition(context, functionFact);
    const application = context.facts
      .filter((fact) => fact.kind === 'application')
      .map((fact) => ({ fact, distance: Math.abs(this.factPosition(context, fact) - functionPosition) }))
      .sort((left, right) => left.distance - right.distance)[0]?.fact;
    return application && !title.toLowerCase().includes(application.value.toLowerCase()) ? `${title} from ${application.value}` : title;
  }

  private delayTitle(context: PlannerContext): string {
    const scope = context.objective;
    const duration = /\bwait\s+((?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:minutes?|hours?|days?|weeks?))(?:\s+before\s+([^,.;]+))?/i.exec(scope);
    if (duration?.[1]) {
      const boundary = duration[2] ? this.shortWaitBoundary(duration[2]) : '';
      return boundary ? `Wait ${duration[1]} before ${boundary}` : `Wait ${duration[1]}`;
    }
    const until = /\b(?:wait|pause|delay(?:\s+processing)?)\s+until\s+([^,.;]+)/i.exec(scope);
    if (until?.[1]) return `Wait until ${this.shortWaitBoundary(until[1], true)}`;
    const waitFor = /\bwait\s+for\s+([^,.;]+)/i.exec(scope);
    if (waitFor?.[1]) return `Wait for ${this.shortWaitBoundary(waitFor[1], true)}`;
    const resume = /\bresume\s+after\s+([^,.;]+)/i.exec(scope);
    if (resume?.[1]) return `Wait for ${this.shortWaitBoundary(resume[1], true)}`;
    return 'Wait for specified boundary';
  }

  private shortWaitBoundary(value: string, normalizeEvent = false): string {
    let boundary = value.trim().replace(/^(?:the|a|an)\s+/i, '').replace(/^(?:sending?|send)\s+(?:the\s+)?/i, '');
    if (normalizeEvent) boundary = boundary
      .replace(/\b(?:customer|client|lead)\s+(?:repl(?:y|ies)|responds?)\b/i, (match) => `${match.split(/\s+/)[0]} response`)
      .replace(/\b(?:is\s+)?received\b/i, 'received');
    const words = boundary.split(/\s+/).filter(Boolean).slice(0, 8);
    return words.join(' ') || 'specified boundary';
  }

  private technicalRetry(graph: GraphBuilder, previous: Node, blockers: string[], objective: string): Node {
    const target = graph.node('action', 'Perform technical operation');
    graph.edge(previous, target, 'ATTEMPT', null, 'retry.attempt');
    const retry = graph.node('retry', 'Retry failed technical operation', [], blockers.filter((id) => /attempt|repetition/.test(id)));
    graph.edge(target, retry, 'TECHNICAL FAILURE', 'Operation failed with a retryable technical error.', 'retry.failure');
    graph.edge(retry, target, 'RETRY', 'Retry budget remains.', 'retry.repeat');
    const failure = graph.node('error-handler', 'Handle exhausted retry boundary', [], blockers.filter((id) => /attempt|escalation/.test(id)));
    const exhausted = graph.edge(retry, failure, 'RETRY EXHAUSTED', 'Retry budget is exhausted.', 'retry.exhausted');
    const match = objective.match(/(?:max(?:imum)?|after|up to)\s+(\d+)\s+(?:attempt|retr)/i);
    graph.retries.push({
      nodeId: retry.id, targetNodeId: target.id, maximumAttempts: match?.[1] ? Number(match[1]) : null,
      delay: null, terminationCondition: match?.[1] ? `Stop after ${match[1]} attempts.` : 'Blocked until the retry limit is clarified.',
      failureEdgeId: exhausted.id,
    });
    return failure;
  }

  private approvalFlow(graph: GraphBuilder, previous: Node, blockers: string[]): Node {
    const approval = graph.node('human-approval', 'Request human approval', [], blockers.filter((id) => /approval/.test(id)));
    graph.edge(previous, approval, 'REQUEST APPROVAL', null, 'approval.request');
    const decision = graph.node('binary-condition', 'Was approval granted?');
    graph.edge(approval, decision, 'DECIDE', null, 'approval.decision');
    const approved = graph.node('action', 'Handle approved outcome');
    const rejected = graph.node('manual-review', 'Handle rejected outcome');
    const trueEdge = graph.edge(decision, approved, 'TRUE', 'Approval granted.', 'approval.true');
    const falseEdge = graph.edge(decision, rejected, 'FALSE', 'Approval rejected.', 'approval.false');
    graph.binaryConditions.push({ nodeId: decision.id, trueEdgeId: trueEdge.id, falseEdgeId: falseEdge.id });
    const merge = graph.node('merge', 'Rejoin approval outcomes');
    const approvedIn = graph.edge(approved, merge, 'APPROVED COMPLETE', null, 'approval.merge');
    const rejectedIn = graph.edge(rejected, merge, 'REJECTED COMPLETE', null, 'approval.merge');
    const continuation = graph.node('data-transformation', 'Continue after approval decision');
    const continuationEdge = graph.edge(merge, continuation, 'CONTINUE', null, 'approval.continue');
    graph.merges.push({ nodeId: merge.id, incomingBranches: [approvedIn.id, rejectedIn.id], mergeStrategy: 'first_available', continuationEdgeId: continuationEdge.id });
    return continuation;
  }

  private validateCompilerInvariants(plan: StructuredWorkflowPlan): PlannerGraphIssue[] {
    const issues: PlannerGraphIssue[] = [];
    const incoming = new Map(plan.nodes.map((node) => [node.id, plan.edges.filter((edge) => edge.target === node.id)]));
    const outgoing = new Map(plan.nodes.map((node) => [node.id, plan.edges.filter((edge) => edge.source === node.id)]));
    for (const node of plan.nodes) {
      if (node.canonicalFunctionId === 'trigger' && (incoming.get(node.id)?.length ?? 0) > 0) issues.push({ code: 'P4_TRIGGER_HAS_INPUT', message: `${node.id} trigger has an incoming edge.` });
      if (node.canonicalFunctionId === 'end' && (outgoing.get(node.id)?.length ?? 0) > 0) issues.push({ code: 'P4_END_HAS_OUTPUT', message: `${node.id} end has an outgoing edge.` });
      if (node.canonicalFunctionId === 'iterator') {
        const labels = new Set(outgoing.get(node.id)?.map((edge) => edge.label));
        if (!labels.has('ITEM') || (!labels.has('ITERATION COMPLETE') && !labels.has('DONE'))) issues.push({ code: 'P4_ITERATOR_INCOMPLETE', message: `${node.id} lacks item and completion paths.` });
      }
      if (node.canonicalFunctionId === 'aggregator' && !(incoming.get(node.id) ?? []).some((edge) => edge.label === 'ITERATION COMPLETE')) issues.push({ code: 'P4_AGGREGATOR_SOURCE_INVALID', message: `${node.id} does not consume iterator results.` });
      if (node.canonicalFunctionId === 'delay' && !/wait|schedule|interval/i.test(node.title)) issues.push({ code: 'P4_DELAY_BOUNDARY_MISSING', message: `${node.id} lacks a deterministic delay boundary.` });
    }
    return issues;
  }
}
