import { createHash } from "node:crypto";
import {
  canonicalWorkflowSchema,
  type CanonicalWorkflow,
  type PlatformTranslationResult,
  type V22ConceptualGraph,
} from "@awm/shared";

const categoryByRole: Record<string, CanonicalWorkflow["nodes"][number]["category"]> = {
  "workflow-trigger": "trigger", "data-retrieval": "action", "data-transformation": "transformation",
  "validation-gate": "condition", "binary-decision": "condition", "multi-route-decision": "router",
  "collection-iterator": "loop", "business-loop": "loop", "loop-until": "loop",
  "technical-retry": "retry", "branch-merge": "merge", "merge-all": "merge", "merge-any": "merge",
  "item-aggregator": "transformation", "delay-boundary": "delay", "event-wait": "delay",
  notification: "notification", logging: "logger", "manual-review": "human_approval",
  "human-review": "human_approval", approval: "human_approval", "error-handler": "error_handler",
  "sub-workflow": "sub_workflow", "parallel-split": "split", "conditional-parallel-routing": "router",
  "resume-point": "action", "successful-end": "end", "blocked-end": "end",
  "escalation-end": "end", "meaningful-end": "end",
};

export class V2CanonicalWorkflowAdapter {
  public adapt(projectName: string, objective: string, conceptual: V22ConceptualGraph, translation: PlatformTranslationResult): CanonicalWorkflow {
    const nodeIds = new Map(translation.nodes.map((node) => [node.id, stableUuid(`node:${translation.selectedPlatform}:${node.id}`)]));
    const nodes = translation.nodes.map((node) => {
      const role = String(node.configuration.conceptualRole ?? conceptual.nodes.find((item) => node.conceptualNodeIds.includes(item.id))?.role ?? "data-transformation");
      const retry = node.configuration.retry as { maximumAttempts?: number; backoff?: string | null } | undefined;
      return {
        id: nodeIds.get(node.id)!,
        category: categoryByRole[role] ?? "action",
        name: node.label,
        description: node.underlyingOperations.join("; "),
        service: node.applicationId,
        operation: node.operationId ?? node.event ?? node.primitiveType,
        purpose: conceptual.nodes.find((item) => node.conceptualNodeIds.includes(item.id))?.purpose ?? node.label,
        expectedResult: `Complete ${node.label}.`,
        icon: `generic-${categoryByRole[role] ?? "action"}`,
        estimatedExecution: role.includes("wait") || role.includes("delay") ? "Depends on configured timing" : "Under 1 minute",
        inputs: [], outputs: [], credentials: node.applicationId ? [`${node.applicationId} connection`] : [],
        configuration: structuredClone(node.configuration),
        status: node.operationId || node.primitiveKind === "canonical-boundary" ? "incomplete" : "warning",
        configurationCompleteness: node.operationId ? 40 : 20,
        conditions: [], decisionRule: null,
        ...(retry?.maximumAttempts ? { retryPolicy: { attempts: Math.min(10, retry.maximumAttempts), backoff: normalizeBackoff(retry.backoff) } } : {}),
        notes: `V2 conceptual references: ${node.conceptualNodeIds.join(", ")}`,
        bestPractices: [], potentialErrors: [], alternativeImplementations: [],
        performanceNotes: [], securityNotes: [], riskLevel: "low",
      } satisfies CanonicalWorkflow["nodes"][number];
    });
    const conceptualEdges = new Map(conceptual.edges.map((edge) => [edge.id, edge]));
    const connections = translation.edges.map((edge) => {
      const role = edge.conceptualEdgeIds.map((id) => conceptualEdges.get(id)?.role).find(Boolean);
      const semantics = edgeSemantics(role, edge.label);
      return ({
      id: stableUuid(`edge:${translation.selectedPlatform}:${edge.id}`),
      sourceNodeId: nodeIds.get(edge.source)!,
      targetNodeId: nodeIds.get(edge.target)!,
      sourcePort: semantics.sourcePort, targetPort: semantics.targetPort, label: semantics.label,
      condition: edge.condition,
      routeType: semantics.routeType ?? routeType(edge.label),
      branchLabel: semantics.branchLabel ?? branchLabel(edge.label),
      style: semantics.style ?? (edge.label === "FALSE" || edge.label === "REJECTED" || edge.label === "FAILED" ? "failure" : edge.condition ? "conditional" : "success"),
      mappings: [],
    } satisfies CanonicalWorkflow["connections"][number]);
    });
    const now = new Date().toISOString();
    return canonicalWorkflowSchema.parse({
      schemaVersion: "2.0",
      id: stableUuid(`workflow:${translation.selectedPlatform}:${conceptual.objective}`),
      name: projectName,
      summary: objective,
      objective,
      targetPlatform: translation.selectedPlatform,
      confidence: average(nodes.map((_node, index) => translation.nodes[index]!.confidence)),
      actors: [], systems: [...new Set(translation.nodes.map((node) => node.applicationId).filter(Boolean))],
      nodes, connections, branches: [], errorHandling: [], clarificationQuestions: [],
      risks: [], complexity: nodes.length > 12 ? "advanced" : nodes.length > 6 ? "moderate" : "simple",
      assumptions: [], missingInformation: [],
      warnings: translation.warnings.map((warning) => warning.message),
      recommendations: ["Review all operations and credentials before implementation."],
      completionCriteria: conceptual.terminalNodeIds.map((id) => conceptual.nodes.find((node) => node.id === id)?.terminalOutcome).filter(Boolean),
      estimatedExecutionTime: "", createdAt: now, updatedAt: now,
    });
  }
}
function edgeSemantics(role: string | undefined, label: string): Partial<CanonicalWorkflow["connections"][number]> & { sourcePort: string; targetPort: string; label: string } {
  if (role === "item") return { sourcePort: "item", targetPort: "input", label: "Each Item", branchLabel: null, routeType: "conditional", style: "loop" };
  if (role === "loop-back") return { sourcePort: "output", targetPort: "loop-back", label: "Loop Back", branchLabel: "LOOP", routeType: "conditional", style: "loop" };
  if (role === "iteration-complete") return { sourcePort: "done", targetPort: "input", label: "Completed", branchLabel: "DONE", routeType: "success", style: "success" };
  return { sourcePort: "output", targetPort: "input", label };
}

function stableUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
function branchLabel(label: string): CanonicalWorkflow["connections"][number]["branchLabel"] {
  const normalized = label.toUpperCase();
  const allowed = new Set(["TRUE", "FALSE", "SUCCESS", "FAILED", "APPROVED", "REJECTED", "DEFAULT", "LOOP", "DONE"]);
  return allowed.has(normalized) ? normalized as CanonicalWorkflow["connections"][number]["branchLabel"] : null;
}
function routeType(label: string): CanonicalWorkflow["connections"][number]["routeType"] {
  return /FAILED|ERROR|REJECTED|FALSE/i.test(label) ? "failure" : /TRUE|APPROVED|ROUTE|DEFAULT/i.test(label) ? "conditional" : "success";
}
function normalizeBackoff(value: string | null | undefined): "none" | "fixed" | "exponential" {
  return value === "fixed" || value === "exponential" ? value : "none";
}
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
