import { createHash } from 'node:crypto';
import {
  p36BusinessIntentInputSchema,
  p37SkeletonContractVersion,
  p36WorkflowSkeletonInputSchema,
  symbolTableSchema,
  symbolTableVersion,
  type P3BusinessIntentOutput,
  type P3WorkflowSkeletonOutput,
  type P36BusinessIntentInput,
  type P36BusinessIntentOutput,
  type P36WorkflowSkeletonInput,
  type P36WorkflowSkeletonOutput,
  type PlannerContext,
  type SymbolEntry,
  type SymbolNamespace,
  type SymbolTable,
} from '@awm/shared';
import { deriveSemanticRoleSlots } from './semantic-role-model.js';

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
};
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const unique = <T>(values: readonly T[]) => [...new Set(values)];

export class UnknownPlannerSymbolError extends Error {
  public constructor(public readonly namespace: SymbolNamespace, public readonly symbol: number) {
    super(`Unknown ${namespace} symbol ${symbol}.`);
    this.name = 'UnknownPlannerSymbolError';
  }
}

export class PlannerSymbolTable {
  private readonly bySymbol = new Map<string, SymbolEntry>();
  private readonly byStableId = new Map<string, SymbolEntry>();

  public constructor(public readonly value: SymbolTable) {
    for (const [namespace, entries] of Object.entries(value.namespaces) as Array<[SymbolNamespace, SymbolEntry[]]>) {
      for (const entry of entries) {
        this.bySymbol.set(`${namespace}:${entry.symbol}`, entry);
        this.byStableId.set(`${namespace}:${entry.stableId}`, entry);
      }
    }
  }

  public resolve(namespace: SymbolNamespace, symbol: number): string {
    const entry = this.bySymbol.get(`${namespace}:${symbol}`);
    if (!entry) throw new UnknownPlannerSymbolError(namespace, symbol);
    return entry.stableId;
  }

  public label(namespace: SymbolNamespace, symbol: number): string {
    const entry = this.bySymbol.get(`${namespace}:${symbol}`);
    if (!entry) throw new UnknownPlannerSymbolError(namespace, symbol);
    return entry.label;
  }

  public symbol(namespace: SymbolNamespace, stableId: string): number {
    const entry = this.byStableId.get(`${namespace}:${stableId}`);
    if (!entry) throw new Error(`Stable ID ${stableId} is not present in the ${namespace} symbol table.`);
    return entry.symbol;
  }
}

export function buildPlannerSymbolTable(context: PlannerContext, catalogVersion: string): PlannerSymbolTable {
  const entries = (items: Array<{ stableId: string; label: string }>): SymbolEntry[] =>
    unique(items.map((item) => item.stableId)).map((stableId, index) => ({
      symbol: index + 1,
      stableId,
      label: items.find((item) => item.stableId === stableId)!.label,
    }));
  const knowledge = context.patterns;
  const namespaces = {
    application: entries(context.allowedApplications.map((stableId) => ({ stableId, label: context.knowledge.find((item) => item.applicationId === stableId)?.title ?? stableId }))),
    'canonical-function': entries(context.allowedCanonicalFunctions.map((stableId) => ({ stableId, label: stableId }))),
    pattern: entries(context.patterns.map((item) => ({ stableId: item.id, label: item.title }))),
    capability: [],
    clarification: entries(context.clarifications.map((item) => ({ stableId: item.id, label: item.question }))),
    fact: entries(context.facts.map((item) => ({ stableId: item.id, label: `${item.kind}: ${item.value}` }))),
    evidence: entries(context.evidence.map((item) => ({ stableId: item.id, label: item.text }))),
    knowledge: entries(knowledge.map((item) => ({ stableId: item.id, label: item.title }))),
  } satisfies SymbolTable['namespaces'];
  return new PlannerSymbolTable(symbolTableSchema.parse({
    version: symbolTableVersion,
    catalogVersion,
    snapshotHash: hash({ version: symbolTableVersion, catalogVersion, namespaces }),
    namespaces,
  }));
}

export function buildP36IntentInput(runId: string, rawScope: string, context: PlannerContext, catalogVersion: string): { input: P36BusinessIntentInput; table: PlannerSymbolTable } {
  const table = buildPlannerSymbolTable(context, catalogVersion);
  return {
    table,
    input: p36BusinessIntentInputSchema.parse({
      contractVersion: '3.6.0',
      runId,
      rawScope,
      platform: context.platform,
      symbolTable: table.value,
      facts: context.facts.map((item) => ({
        symbol: table.symbol('fact', item.id),
        kind: item.kind,
        value: item.value,
        entity: item.entityId,
        evidenceSymbols: item.evidenceIds.map((id) => table.symbol('evidence', id)),
      })),
      clarifications: context.clarifications.map((item) => ({
        symbol: table.symbol('clarification', item.id),
        category: item.category,
        question: item.question,
        missingFact: item.missingFact,
        evidenceSymbols: item.evidenceIds.map((id) => table.symbol('evidence', id)),
      })),
      patterns: context.patterns.map((item) => ({
        symbol: table.symbol('pattern', item.id),
        title: item.title,
        requiredSignals: item.requiredInputs,
        canonicalFunctionSymbols: item.outputs.filter((id) => context.allowedCanonicalFunctions.includes(id)).map((id) => table.symbol('canonical-function', id)),
      })),
    }),
  };
}

export function resolveP36Intent(input: P36BusinessIntentInput, output: P36BusinessIntentOutput, table: PlannerSymbolTable): P3BusinessIntentOutput {
  const clarifications = new Map(input.clarifications.map((item) => [item.symbol, item]));
  const systems = unique([
    ...output.sourceApplicationSymbols.map((item) => table.label('application', item)),
    ...output.destinationApplicationSymbols.map((item) => table.label('application', item)),
    ...output.unresolvedSystems,
  ]);
  return {
    businessObjective: output.businessObjective,
    actors: output.actors,
    systems,
    businessOutcomes: output.businessOutcomes,
    constraints: output.constraints,
    unresolvedQuestions: output.unresolvedClarificationSymbols.map((symbol) => {
      const clarification = clarifications.get(symbol);
      if (!clarification) throw new UnknownPlannerSymbolError('clarification', symbol);
      return { clarificationId: table.resolve('clarification', symbol), question: clarification.question, blocking: true };
    }),
    decompositionHints: output.decompositionHints,
    factIds: output.factSymbols.map((item) => table.resolve('fact', item)),
    knowledgeIds: output.patternSymbols.map((item) => table.resolve('pattern', item)),
    sourceSystems: output.sourceApplicationSymbols.map((item) => table.label('application', item)),
    destinationSystems: [...output.destinationApplicationSymbols.map((item) => table.label('application', item)), ...output.unresolvedSystems],
    businessEntities: output.businessEntities,
    explicitBusinessRules: output.explicitBusinessRules,
    workflowBoundaryCandidates: output.workflowBoundaryCandidates.map((item, index) => ({
      temporaryId: `boundary-${index + 1}`,
      title: item.title,
      purpose: item.purpose,
      factIds: item.factSymbols.map((symbol) => table.resolve('fact', symbol)),
    })),
  };
}

export function buildP36SkeletonInput(runId: string, context: PlannerContext, intent: P36BusinessIntentOutput, table: PlannerSymbolTable): P36WorkflowSkeletonInput {
  const base = buildP36IntentInput(runId, context.objective, context, table.value.catalogVersion).input;
  return p36WorkflowSkeletonInputSchema.parse({
    contractVersion: p37SkeletonContractVersion,
    runId,
    platform: context.platform,
    symbolTable: table.value,
    intent,
    facts: base.facts,
    clarifications: base.clarifications,
    patterns: base.patterns,
    roleSlots: deriveSemanticRoleSlots(context, table),
    topologyConstraints: [
      'Binary conditions require TRUE and FALSE paths.',
      'Routers require at least three labeled routes unless business evidence explicitly requires only two.',
      'Loops require entry, body, loop-back, exit, and a stop boundary or blocking clarification.',
      'Merges require at least two incoming branches.',
      'Aggregators combine item results and must not converge business branches.',
      'Retries handle technical failure and must not represent business repetition.',
      'Triggers have no incoming workflow edges and terminal roles have no outgoing business edges.',
    ],
  });
}

const at = <T>(values: T[], index: number, kind: string): T => {
  const value = values[index];
  if (value === undefined) throw new Error(`Unknown ${kind} index ${index}.`);
  return value;
};

export function resolveP36Skeleton(input: P36WorkflowSkeletonInput, output: P36WorkflowSkeletonOutput, table: PlannerSymbolTable): P3WorkflowSkeletonOutput {
  return {
    workflows: output.workflows.map((workflow, workflowIndex) => {
      const nodeKeys = workflow.nodes.map((_item, index) => `node-${index + 1}`);
      const edgeKeys = workflow.edges.map((_item, index) => `edge-${index + 1}`);
      return {
        temporaryWorkflowId: `workflow-${workflowIndex + 1}`,
        title: workflow.title,
        boundaryCandidateId: `boundary-${workflow.boundaryIndex + 1}`,
        entryNodeKey: at(nodeKeys, workflow.entryNodeIndex, 'entry node'),
        exitNodeKeys: workflow.exitNodeIndexes.map((index) => at(nodeKeys, index, 'exit node')),
        nodes: workflow.nodes.map((node, index) => ({
          key: nodeKeys[index]!,
          canonicalFunctionId: table.resolve('canonical-function', node.canonicalFunctionSymbol),
          title: node.title,
          factIds: node.factSymbols.map((item) => table.resolve('fact', item)),
          evidenceIds: node.evidenceSymbols.map((item) => table.resolve('evidence', item)),
          knowledgeIds: node.knowledgeSymbols.map((item) => table.resolve('knowledge', item)),
          blockedByClarificationIds: node.blockedByClarificationSymbols.map((item) => table.resolve('clarification', item)),
          unresolvedGroundingRequirements: node.unresolvedGroundingRequirements,
        })),
        edges: workflow.edges.map((edge, index) => ({
          key: edgeKeys[index]!,
          sourceKey: at(nodeKeys, edge.sourceIndex, 'edge source'),
          targetKey: at(nodeKeys, edge.targetIndex, 'edge target'),
          label: edge.label,
          condition: edge.condition,
          evidenceIds: edge.evidenceSymbols.map((item) => table.resolve('evidence', item)),
        })),
        binaryConditions: workflow.binaryConditions.map((item) => ({
          nodeKey: at(nodeKeys, item.nodeIndex, 'binary node'),
          trueEdgeKey: at(edgeKeys, item.trueEdgeIndex, 'TRUE edge'),
          falseEdgeKey: at(edgeKeys, item.falseEdgeIndex, 'FALSE edge'),
        })),
        routers: workflow.routers.map((item) => ({
          nodeKey: at(nodeKeys, item.nodeIndex, 'router node'),
          routes: item.routes.map((route) => ({
            label: route.label,
            condition: route.condition,
            destinationKey: at(nodeKeys, route.destinationNodeIndex, 'route destination'),
            edgeKey: at(edgeKeys, route.edgeIndex, 'route edge'),
          })),
        })),
        loops: workflow.loops.map((item) => ({
          nodeKey: at(nodeKeys, item.nodeIndex, 'loop node'),
          entryEdgeKey: at(edgeKeys, item.entryEdgeIndex, 'loop entry edge'),
          bodyEntryKey: at(nodeKeys, item.bodyEntryNodeIndex, 'loop body entry'),
          bodyExitKey: at(nodeKeys, item.bodyExitNodeIndex, 'loop body exit'),
          exitEdgeKey: at(edgeKeys, item.exitEdgeIndex, 'loop exit edge'),
          stopBoundary: item.stopBoundary,
        })),
        merges: workflow.merges.map((item) => ({
          nodeKey: at(nodeKeys, item.nodeIndex, 'merge node'),
          incomingEdgeKeys: item.incomingEdgeIndexes.map((index) => at(edgeKeys, index, 'merge incoming edge')),
          continuationEdgeKey: at(edgeKeys, item.continuationEdgeIndex, 'merge continuation edge'),
        })),
        blockingClarificationIds: workflow.blockingClarificationSymbols.map((item) => table.resolve('clarification', item)),
      };
    }),
  };
}
