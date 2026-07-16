import { z } from 'zod';
import type { StructuredWorkflowPlan } from '@awm/shared';

const nullableString = z.string().nullable();
const strings = z.array(z.string());

export const compactPlannerPlanSchema = z.object({
  v: z.literal('1.1'),
  o: z.string(),
  p: z.enum(['zapier', 'make', 'n8n']),
  entry: z.string(),
  n: z.array(z.object({
    i: z.string(), f: z.string(), t: z.string(), a: nullableString, o: nullableString,
    in: strings, out: strings, facts: strings, patterns: strings, k: strings, caps: strings,
    blocks: strings, limits: strings,
  }).strict()).min(1),
  e: z.array(z.object({
    i: z.string(), s: z.string(), t: z.string(), c: nullableString, l: z.string(),
    p: z.string(), b: z.string(), r: z.string(), ev: strings.min(1),
  }).strict()),
  b: z.array(z.object({ n: z.string(), t: z.string(), f: z.string() }).strict()),
  r: z.array(z.object({ n: z.string(), routes: z.array(z.object({ l: z.string(), c: z.string(), d: z.string(), e: z.string() }).strict()).min(2) }).strict()),
  m: z.array(z.object({ n: z.string(), in: strings.min(2), strategy: z.enum(['wait_all', 'first_available', 'combine', 'concatenate']), next: z.string() }).strict()),
  l: z.array(z.object({ n: z.string(), entry: z.string(), bodyIn: z.string(), bodyOut: z.string(), exit: z.string(), stop: z.string() }).strict()),
  y: z.array(z.object({ n: z.string(), target: z.string(), max: z.number().int().positive().nullable(), delay: nullableString, stop: z.string(), fail: z.string() }).strict()),
  c: strings,
  w: strings,
}).strict();

export function expandCompactPlannerPlan(value: z.infer<typeof compactPlannerPlanSchema>): StructuredWorkflowPlan {
  return {
    version: value.v, objective: value.o, platform: value.p, entryNodeId: value.entry,
    nodes: value.n.map((node) => ({
      id: node.i, canonicalFunctionId: node.f, title: node.t, applicationRef: node.a, operationRef: node.o,
      inputs: node.in, outputs: node.out, factIds: node.facts, patternIds: node.patterns,
      knowledgeIds: node.k, capabilityIds: node.caps, blockedByClarificationIds: node.blocks,
      limitationAcknowledgements: node.limits,
    })),
    edges: value.e.map((edge) => ({
      id: edge.i, source: edge.s, target: edge.t, condition: edge.c, label: edge.l,
      purpose: edge.p, businessReason: edge.b, ruleId: edge.r, evidenceIds: edge.ev,
    })),
    binaryConditions: value.b.map((item) => ({ nodeId: item.n, trueEdgeId: item.t, falseEdgeId: item.f })),
    routers: value.r.map((item) => ({ nodeId: item.n, routes: item.routes.map((route) => ({ label: route.l, condition: route.c, destination: route.d, edgeId: route.e })) })),
    merges: value.m.map((item) => ({ nodeId: item.n, incomingBranches: item.in, mergeStrategy: item.strategy, continuationEdgeId: item.next })),
    loops: value.l.map((item) => ({ nodeId: item.n, entryEdgeId: item.entry, bodyEntryNodeId: item.bodyIn, bodyExitNodeId: item.bodyOut, exitEdgeId: item.exit, terminationCondition: item.stop })),
    retries: value.y.map((item) => ({ nodeId: item.n, targetNodeId: item.target, maximumAttempts: item.max, delay: item.delay, terminationCondition: item.stop, failureEdgeId: item.fail })),
    blockedByClarificationIds: value.c, warnings: value.w,
  };
}
