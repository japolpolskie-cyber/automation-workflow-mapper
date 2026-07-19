import {
  v22ConceptualGraphSchema,
  type ControlFlowClassification,
  type LifecycleCapabilityGroup,
  type PlannerEdgeRole,
  type PlannerSemanticRole,
  type RequirementSourceReference,
  type V21AnalysisArtifacts,
  type V22ConceptualEdge,
  type V22ConceptualGraph,
  type V22ConceptualNode,
} from '@awm/shared';

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
const title = (value: string) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

class ConceptualGraphBuilder {
  public readonly nodes: V22ConceptualNode[] = [];
  public readonly edges: V22ConceptualEdge[] = [];
  private nodeSequence = 0;
  private edgeSequence = 0;

  public node(
    role: PlannerSemanticRole,
    titleValue: string,
    sourceReferences: RequirementSourceReference[],
    options: Partial<Omit<V22ConceptualNode, 'id' | 'role' | 'title' | 'sourceReferences'>> = {},
  ): V22ConceptualNode {
    const node = {
      id: `v22-node-${String(++this.nodeSequence).padStart(3, '0')}`,
      role,
      title: titleValue,
      purpose: options.purpose ?? titleValue,
      capabilityGroupIds: options.capabilityGroupIds ?? [],
      factIds: options.factIds ?? [],
      evidenceIds: options.evidenceIds ?? [],
      sourceReferences,
      confidence: options.confidence ?? 1,
      lifecycleStage: options.lifecycleStage ?? null,
      underlyingOperations: options.underlyingOperations ?? [],
      collectionSource: options.collectionSource ?? null,
      wait: options.wait ?? null,
      retry: options.retry ?? null,
      terminalOutcome: options.terminalOutcome ?? null,
    } satisfies V22ConceptualNode;
    this.nodes.push(node);
    return node;
  }

  public edge(source: V22ConceptualNode, target: V22ConceptualNode, role: PlannerEdgeRole, label: string, reference: RequirementSourceReference[], condition: string | null = null, evidenceIds: string[] = []): V22ConceptualEdge {
    const edge = {
      id: `v22-edge-${String(++this.edgeSequence).padStart(3, '0')}`,
      source: source.id,
      target: target.id,
      role,
      label,
      condition,
      businessReason: condition ?? `${label}: continue from ${source.title} to ${target.title}.`,
      evidenceIds,
      sourceReferences: reference,
    } satisfies V22ConceptualEdge;
    this.edges.push(edge);
    return edge;
  }
}

export class V22ConceptualGraphBuilder {
  public build(artifacts: V21AnalysisArtifacts): V22ConceptualGraph {
    const graph = new ConceptualGraphBuilder();
    const fallbackReference = this.firstReference(artifacts);
    const entry = graph.node('workflow-trigger', artifacts.requirementAnalysis.trigger?.value || 'Procedural workflow start', artifacts.requirementAnalysis.trigger?.sourceReferences.length ? artifacts.requirementAnalysis.trigger.sourceReferences : [fallbackReference], {
      purpose: 'Enter the conceptual workflow without selecting a platform implementation.',
      factIds: artifacts.requirementAnalysis.trigger?.factIds ?? [],
      evidenceIds: artifacts.requirementAnalysis.trigger?.evidenceIds ?? [],
    });
    let tail = entry;
    const consumed = new Set<string>();

    const elements = [
      ...artifacts.capabilityGroups.map((group) => ({ kind: 'capability' as const, position: group.sourceReferences[0]?.start ?? Number.MAX_SAFE_INTEGER, group })),
      ...artifacts.controlFlow.map((flow) => ({ kind: 'flow' as const, position: flow.sourceReferences[0]?.start ?? Number.MAX_SAFE_INTEGER, flow })),
    ].sort((left, right) => left.position - right.position || (left.kind === 'flow' ? -1 : 1));

    for (const element of elements) {
      if (element.kind === 'capability') {
        const capability = this.capabilityNode(graph, element.group);
        graph.edge(tail, capability, 'flow', 'NEXT', capability.sourceReferences, null, capability.evidenceIds);
        tail = capability;
        continue;
      }
      if (consumed.has(element.flow.id)) continue;
      const related = artifacts.controlFlow.filter((candidate) => this.sameBoundary(element.flow, candidate));
      if (element.flow.type === 'merge-all' && related.some((candidate) => candidate.type === 'conditional-parallel-routing')) continue;
      if (element.flow.type === 'approval' && related.some((candidate) => candidate.type === 'conditional-parallel-routing')) continue;
      if (element.flow.type === 'binary-decision' && related.some((candidate) => candidate.type === 'approval' || candidate.type === 'human-review')) continue;

      const result = this.appendControlFlow(graph, tail, element.flow, related, artifacts);
      tail = result.tail;
      for (const id of result.consumedIds) consumed.add(id);
    }

    const terminalReference = artifacts.requirementAnalysis.endStates[0]?.sourceReferences.length
      ? artifacts.requirementAnalysis.endStates[0].sourceReferences
      : [fallbackReference];
    const terminalOutcome = artifacts.requirementAnalysis.endStates[0]?.value || `Completed: ${artifacts.requirementAnalysis.objective}`;
    const terminal = graph.node('meaningful-end', terminalOutcome, terminalReference, {
      purpose: 'Express the final business outcome of the conceptual workflow.',
      factIds: artifacts.requirementAnalysis.endStates.flatMap((item) => item.factIds),
      evidenceIds: artifacts.requirementAnalysis.endStates.flatMap((item) => item.evidenceIds),
      terminalOutcome,
    });
    graph.edge(tail, terminal, 'continuation', 'COMPLETED', terminalReference);

    return v22ConceptualGraphSchema.parse({
      version: '2.2',
      shadowMode: true,
      objective: artifacts.requirementAnalysis.objective,
      entryNodeId: entry.id,
      terminalNodeIds: [terminal.id],
      nodes: graph.nodes,
      edges: graph.edges,
      sourceV21Version: '2.1',
      legacyK41Compatible: true,
    });
  }

  private appendControlFlow(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification, related: ControlFlowClassification[], artifacts: V21AnalysisArtifacts): { tail: V22ConceptualNode; consumedIds: string[] } {
    if (flow.type === 'conditional-parallel-routing' || flow.type === 'parallel-split') return this.parallel(graph, previous, flow, artifacts);
    if (flow.type === 'human-review' || flow.type === 'approval') return this.humanReview(graph, previous, flow);
    if (flow.type === 'event-wait' || flow.type === 'delay') return this.wait(graph, previous, flow, artifacts);
    if (flow.type === 'iterator') {
      const aggregator = artifacts.controlFlow.find((candidate) => candidate.type === 'aggregator' && !this.before(candidate, flow));
      return this.iteration(graph, previous, flow, aggregator);
    }
    if (flow.type === 'aggregator' && related.some((candidate) => candidate.type === 'iterator')) return { tail: previous, consumedIds: [flow.id] };
    if (flow.type === 'loop-until') return this.loop(graph, previous, flow);
    if (flow.type === 'retry') {
      const errorHandler = artifacts.controlFlow.find((candidate) => candidate.type === 'error-handler' && !this.before(candidate, flow));
      const resume = artifacts.controlFlow.find((candidate) => candidate.type === 'resume-point' && !this.before(candidate, flow));
      return this.retry(graph, previous, flow, errorHandler, resume);
    }
    if (flow.type === 'error-handler' || flow.type === 'resume-point') return this.single(graph, previous, flow, flow.type);
    if (flow.type === 'subworkflow') return this.subworkflow(graph, previous, flow);
    if (flow.type === 'multi-outcome-decision') return this.multiOutcome(graph, previous, flow);
    if (flow.type === 'binary-decision') return this.binary(graph, previous, flow);
    if (flow.type === 'filter') return this.single(graph, previous, flow, 'validation-gate');
    if (flow.type === 'merge-all' || flow.type === 'merge-any') return this.single(graph, previous, flow, flow.type);
    if (flow.type === 'termination') return { tail: previous, consumedIds: [flow.id] };
    return this.single(graph, previous, flow, 'data-transformation');
  }

  private capabilityNode(graph: ConceptualGraphBuilder, group: LifecycleCapabilityGroup): V22ConceptualNode {
    return graph.node('data-transformation', group.title, group.sourceReferences, {
      purpose: group.purpose,
      capabilityGroupIds: [group.id],
      factIds: group.operationFactIds,
      evidenceIds: group.evidenceIds,
      confidence: group.confidence,
      lifecycleStage: group.lifecycleStage,
      underlyingOperations: group.underlyingOperations.map((item) => item.operation),
    });
  }

  private parallel(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification, artifacts: V21AnalysisArtifacts) {
    const role = flow.type === 'conditional-parallel-routing' ? 'conditional-parallel-routing' : 'parallel-split';
    const split = this.flowNode(graph, role, role === 'conditional-parallel-routing' ? 'Evaluate Parallel Approval Rules' : 'Start Parallel Work', flow);
    graph.edge(previous, split, 'flow', 'NEXT', flow.sourceReferences, null, flow.evidenceIds);
    const actors = artifacts.requirementAnalysis.actors.filter((actor) => actor.sourceReferences.some((ref) => flow.sourceReferences.some((source) => source.stepId === ref.stepId))).map((item) => item.value);
    const branchNames = [...new Set(actors)].slice(0, 4);
    while (branchNames.length < 2) branchNames.push(`Required Approver ${String.fromCharCode(65 + branchNames.length)}`);
    const mergeRole = flow.synchronizationRequired ? 'merge-all' : 'merge-any';
    const merge = this.flowNode(graph, mergeRole, mergeRole === 'merge-all' ? 'Synchronize Required Results' : 'Continue After First Result', flow);
    for (const name of branchNames) {
      const branch = graph.node('approval', `${title(name)} Review`, flow.sourceReferences, this.metadata(flow));
      graph.edge(split, branch, role === 'conditional-parallel-routing' ? 'conditional-branch' : 'parallel-branch', title(name), flow.sourceReferences, `${name} rule applies.`, flow.evidenceIds);
      graph.edge(branch, merge, 'merge-input', `${title(name)} COMPLETE`, flow.sourceReferences, null, flow.evidenceIds);
    }
    const result = graph.node('data-transformation', 'Continue With Synchronized Result', flow.sourceReferences, this.metadata(flow));
    graph.edge(merge, result, 'continuation', 'CONTINUE', flow.sourceReferences, null, flow.evidenceIds);
    return { tail: result, consumedIds: [flow.id] };
  }

  private humanReview(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification) {
    const review = this.flowNode(graph, flow.type === 'approval' ? 'approval' : 'human-review', flow.type === 'approval' ? 'Request Human Approval' : 'Request Human Review', flow);
    graph.edge(previous, review, 'flow', 'REQUEST REVIEW', flow.sourceReferences, null, flow.evidenceIds);
    const wait = graph.node('event-wait', 'Wait For Human Response', flow.sourceReferences, {
      ...this.metadata(flow),
      wait: { resumeCondition: flow.wait?.resumeCondition ?? 'Resume after the human response.', timeoutPolicy: null, correlationIdentifier: `human:${slug(flow.sourceReferences[0]!.stepId)}:${slug(flow.id)}` },
    });
    graph.edge(review, wait, 'continuation', 'AWAIT RESPONSE', flow.sourceReferences, null, flow.evidenceIds);
    const resume = this.flowNode(graph, 'resume-point', 'Resume After Review', flow);
    graph.edge(wait, resume, 'resume', 'RESPONSE RECEIVED', flow.sourceReferences, wait.wait?.resumeCondition ?? null, flow.evidenceIds);
    const decision = this.flowNode(graph, 'multi-route-decision', 'Apply Review Outcome', flow);
    graph.edge(resume, decision, 'continuation', 'EVALUATE OUTCOME', flow.sourceReferences, null, flow.evidenceIds);
    const source = flow.sourceReferences.map((item) => item.text).join(' ');
    const outcomes = /revis|resubmit/i.test(source) ? ['Approved', 'Rejected', 'Revision Required'] : ['Approved', 'Rejected'];
    const merge = this.flowNode(graph, 'merge-any', 'Rejoin Review Outcomes', flow);
    for (const outcome of outcomes) {
      const result = graph.node('data-transformation', `${outcome} Outcome`, flow.sourceReferences, this.metadata(flow));
      graph.edge(decision, result, 'route', outcome.toUpperCase(), flow.sourceReferences, `Review outcome is ${outcome}.`, flow.evidenceIds);
      graph.edge(result, merge, 'merge-input', `${outcome.toUpperCase()} HANDLED`, flow.sourceReferences, null, flow.evidenceIds);
    }
    const continuation = this.flowNode(graph, 'data-transformation', 'Continue After Review Outcome', flow);
    graph.edge(merge, continuation, 'continuation', 'CONTINUE', flow.sourceReferences, null, flow.evidenceIds);
    return { tail: continuation, consumedIds: [flow.id] };
  }

  private wait(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification, artifacts: V21AnalysisArtifacts) {
    const event = flow.type === 'event-wait';
    const identifier = artifacts.requirementAnalysis.identifiers[0]?.value ?? `${event ? 'event' : 'timer'}:${slug(flow.sourceReferences[0]!.stepId)}:${slug(flow.wait?.resumeCondition ?? flow.id)}`;
    const wait = graph.node(event ? 'event-wait' : 'delay-boundary', event ? 'Wait For External Event' : 'Wait For Specified Duration', flow.sourceReferences, {
      ...this.metadata(flow),
      wait: { resumeCondition: flow.wait?.resumeCondition ?? 'Resume when the wait condition is satisfied.', timeoutPolicy: null, correlationIdentifier: event ? identifier : null },
    });
    graph.edge(previous, wait, 'flow', 'WAIT', flow.sourceReferences, null, flow.evidenceIds);
    const resume = this.flowNode(graph, 'resume-point', 'Resume Workflow', flow);
    graph.edge(wait, resume, 'resume', 'RESUME', flow.sourceReferences, wait.wait?.resumeCondition ?? null, flow.evidenceIds);
    return { tail: resume, consumedIds: [flow.id] };
  }

  private iteration(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification, aggregator: ControlFlowClassification | undefined) {
    const iterator = graph.node('collection-iterator', `Iterate ${title(flow.collectionSource ?? 'Collection')}`, flow.sourceReferences, { ...this.metadata(flow), collectionSource: flow.collectionSource ?? 'item' });
    graph.edge(previous, iterator, 'flow', 'COLLECTION', flow.sourceReferences, null, flow.evidenceIds);
    const item = this.flowNode(graph, 'data-transformation', `Process Current ${title(flow.collectionSource ?? 'Item')}`, flow);
    graph.edge(iterator, item, 'item', 'CURRENT ITEM', flow.sourceReferences, null, flow.evidenceIds);
    const aggregateFlow = aggregator ?? flow;
    const aggregate = this.flowNode(graph, 'item-aggregator', 'Aggregate Item Results', aggregateFlow);
    graph.edge(item, aggregate, 'item-result', 'ITEM RESULT', flow.sourceReferences, null, flow.evidenceIds);
    graph.edge(iterator, aggregate, 'iteration-complete', 'ITERATION COMPLETE', flow.sourceReferences, null, flow.evidenceIds);
    const continuation = this.flowNode(graph, 'data-transformation', 'Continue With Aggregated Result', aggregateFlow);
    graph.edge(aggregate, continuation, 'continuation', 'CONTINUE', aggregateFlow.sourceReferences, null, aggregateFlow.evidenceIds);
    return { tail: continuation, consumedIds: [flow.id, ...(aggregator ? [aggregator.id] : [])] };
  }

  private loop(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification) {
    const loop = this.flowNode(graph, 'loop-until', 'Revise And Resubmit Until Accepted', flow);
    graph.edge(previous, loop, 'flow', 'NEXT', flow.sourceReferences, null, flow.evidenceIds);
    const body = this.flowNode(graph, 'data-transformation', title(flow.loop?.target ?? 'Revise Submission'), flow);
    graph.edge(loop, body, 'loop-entry', 'REVISION REQUIRED', flow.sourceReferences, 'Revision is required.', flow.evidenceIds);
    graph.edge(body, loop, 'loop-back', 'RESUBMIT', flow.sourceReferences, 'Return the revised item for another review.', flow.evidenceIds);
    const continuation = this.flowNode(graph, 'data-transformation', 'Continue After Accepted Revision', flow);
    graph.edge(loop, continuation, 'loop-exit', 'ACCEPTED', flow.sourceReferences, flow.loop?.exitCondition ?? 'Revision accepted.', flow.evidenceIds);
    return { tail: continuation, consumedIds: [flow.id] };
  }

  private retry(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification, error: ControlFlowClassification | undefined, resumeFlow: ControlFlowClassification | undefined) {
    const operation = this.flowNode(graph, 'data-transformation', 'Perform Retryable Operation', flow);
    graph.edge(previous, operation, 'flow', 'ATTEMPT', flow.sourceReferences, null, flow.evidenceIds);
    const retry = graph.node('technical-retry', 'Apply Bounded Retry Policy', flow.sourceReferences, {
      ...this.metadata(flow),
      retry: { maximumAttempts: flow.retryPolicy?.maximumAttempts ?? 1, backoff: flow.retryPolicy?.backoff ?? null },
    });
    graph.edge(operation, retry, 'error', 'RETRYABLE FAILURE', flow.sourceReferences, 'The operation failed with a retryable technical error.', flow.evidenceIds);
    graph.edge(retry, operation, 'retry', 'RETRY', flow.sourceReferences, 'Retry budget remains.', flow.evidenceIds);
    const errorFlow = error ?? flow;
    const handler = this.flowNode(graph, 'error-handler', 'Handle Exhausted Retry', errorFlow);
    graph.edge(retry, handler, 'retry-exhausted', 'RETRY EXHAUSTED', flow.sourceReferences, 'The bounded retry budget is exhausted.', flow.evidenceIds);
    const resume = this.flowNode(graph, 'resume-point', 'Resume After Failure Handling', resumeFlow ?? errorFlow);
    graph.edge(handler, resume, 'handled', 'HANDLED', handler.sourceReferences, null, handler.evidenceIds);
    const continuation = this.flowNode(graph, 'data-transformation', 'Continue After Retry Boundary', flow);
    graph.edge(operation, continuation, 'continuation', 'SUCCESS', flow.sourceReferences, 'The operation completed successfully.', flow.evidenceIds);
    graph.edge(resume, continuation, 'resume', 'RESUME', resume.sourceReferences, 'Failure handling permits continuation.', resume.evidenceIds);
    return { tail: continuation, consumedIds: [flow.id, ...(error ? [error.id] : []), ...(resumeFlow ? [resumeFlow.id] : [])] };
  }

  private subworkflow(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification) {
    const subworkflow = this.flowNode(graph, 'sub-workflow', 'Invoke Reusable Sub-Workflow', flow);
    graph.edge(previous, subworkflow, 'flow', 'INVOKE', flow.sourceReferences, null, flow.evidenceIds);
    const continuation = this.flowNode(graph, 'data-transformation', 'Continue With Sub-Workflow Result', flow);
    graph.edge(subworkflow, continuation, 'subworkflow-return', 'RETURN', flow.sourceReferences, 'The reusable workflow completed.', flow.evidenceIds);
    return { tail: continuation, consumedIds: [flow.id] };
  }

  private multiOutcome(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification) {
    const decision = this.flowNode(graph, 'multi-route-decision', 'Evaluate Multiple Outcomes', flow);
    graph.edge(previous, decision, 'flow', 'EVALUATE', flow.sourceReferences, null, flow.evidenceIds);
    const merge = this.flowNode(graph, 'merge-any', 'Rejoin Exclusive Outcomes', flow);
    for (const route of ['Route A', 'Route B', 'Default Route']) {
      const outcome = this.flowNode(graph, 'data-transformation', route, flow);
      graph.edge(decision, outcome, route === 'Default Route' ? 'fallback' : 'route', route.toUpperCase(), flow.sourceReferences, `${route} condition is satisfied.`, flow.evidenceIds);
      graph.edge(outcome, merge, 'merge-input', `${route.toUpperCase()} COMPLETE`, flow.sourceReferences, null, flow.evidenceIds);
    }
    const continuation = this.flowNode(graph, 'data-transformation', 'Continue After Routed Outcome', flow);
    graph.edge(merge, continuation, 'continuation', 'CONTINUE', flow.sourceReferences, null, flow.evidenceIds);
    return { tail: continuation, consumedIds: [flow.id] };
  }

  private binary(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification) {
    const decision = this.flowNode(graph, 'binary-decision', 'Evaluate Binary Outcome', flow);
    graph.edge(previous, decision, 'flow', 'EVALUATE', flow.sourceReferences, null, flow.evidenceIds);
    const merge = this.flowNode(graph, 'merge-any', 'Rejoin Binary Outcomes', flow);
    for (const [label, role] of [['TRUE', 'true'], ['FALSE', 'false']] as const) {
      const outcome = this.flowNode(graph, 'data-transformation', `${label} Outcome`, flow);
      graph.edge(decision, outcome, role, label, flow.sourceReferences, `Condition is ${label.toLowerCase()}.`, flow.evidenceIds);
      graph.edge(outcome, merge, 'merge-input', `${label} COMPLETE`, flow.sourceReferences, null, flow.evidenceIds);
    }
    const continuation = this.flowNode(graph, 'data-transformation', 'Continue After Binary Outcome', flow);
    graph.edge(merge, continuation, 'continuation', 'CONTINUE', flow.sourceReferences, null, flow.evidenceIds);
    return { tail: continuation, consumedIds: [flow.id] };
  }

  private single(graph: ConceptualGraphBuilder, previous: V22ConceptualNode, flow: ControlFlowClassification, role: PlannerSemanticRole) {
    const node = this.flowNode(graph, role, title(flow.type), flow);
    graph.edge(previous, node, 'flow', 'NEXT', flow.sourceReferences, null, flow.evidenceIds);
    return { tail: node, consumedIds: [flow.id] };
  }

  private flowNode(graph: ConceptualGraphBuilder, role: PlannerSemanticRole, nodeTitle: string, flow: ControlFlowClassification): V22ConceptualNode {
    return graph.node(role, nodeTitle, flow.sourceReferences, this.metadata(flow));
  }

  private metadata(flow: ControlFlowClassification): Partial<V22ConceptualNode> {
    return {
      purpose: flow.reason,
      factIds: flow.factIds,
      evidenceIds: flow.evidenceIds,
      confidence: flow.confidence,
    };
  }

  private firstReference(artifacts: V21AnalysisArtifacts): RequirementSourceReference {
    return artifacts.requirementAnalysis.trigger?.sourceReferences[0]
      ?? artifacts.capabilityGroups[0]?.sourceReferences[0]
      ?? artifacts.controlFlow[0]?.sourceReferences[0]
      ?? artifacts.requirementAnalysis.entities[0]?.sourceReferences[0]
      ?? { segmentId: 'scope', stepId: 'scope', start: 0, end: Math.max(1, artifacts.requirementAnalysis.objective.length), text: artifacts.requirementAnalysis.objective };
  }

  private sameBoundary(left: ControlFlowClassification, right: ControlFlowClassification): boolean {
    return left.sourceReferences.some((leftRef) => right.sourceReferences.some((rightRef) => leftRef.stepId === rightRef.stepId));
  }

  private before(left: ControlFlowClassification, right: ControlFlowClassification): boolean {
    return (left.sourceReferences[0]?.start ?? 0) < (right.sourceReferences[0]?.start ?? 0);
  }
}
