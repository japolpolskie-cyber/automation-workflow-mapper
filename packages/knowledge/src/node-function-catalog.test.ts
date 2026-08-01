import { lockedDepartmentRoutingWorkflowBrief, safeParseCanonicalWorkflowBrief } from '@awm/shared';
import { describe, expect, it } from 'vitest';
import * as publicKnowledge from './index.js';
import {
  getNodeFunctionContract,
  hasNodeFunctionContract,
  listNodeFunctionContracts,
  nodeFunctionCatalogSchema,
  nodeFunctionContractSchema,
  parseNodeFunctionContract,
  routerNodeFunctionContract,
  safeParseNodeFunctionContract,
} from './node-function-catalog.js';

const expectedCatalogIds = [
  'trigger', 'action', 'binary-decision', 'router', 'filter', 'iterator', 'aggregator',
  'merge', 'wait', 'approval', 'retry', 'follow-up-loop', 'revision-loop', 'polling-loop',
  'return-to-step-loop', 'error-handler', 'sub-workflow', 'terminal', 'ai-agent',
  'ai-classification', 'ai-extraction', 'ai-summarization', 'ai-generation',
];

describe('conceptual node-function catalog', () => {
  it('contains every initial catalog ID exactly once', () => {
    const contracts = listNodeFunctionContracts();
    expect(contracts.map((contract) => contract.id).sort()).toEqual([...expectedCatalogIds].sort());
    expect(new Set(contracts.map((contract) => contract.id)).size).toBe(contracts.length);
  });

  it('parses every catalog entry', () => {
    for (const contract of listNodeFunctionContracts()) expect(parseNodeFunctionContract(contract)).toEqual(contract);
  });

  it('keeps Router detailed and every other entry at foundation status', () => {
    for (const contract of listNodeFunctionContracts()) expect(contract.status).toBe(contract.id === 'router' ? 'detailed' : 'foundation');
  });

  it('supports normalized lookup, presence checks, and unknown IDs', () => {
    expect(getNodeFunctionContract(' ROUTER ')?.id).toBe('router');
    expect(hasNodeFunctionContract('Router')).toBe(true);
    expect(getNodeFunctionContract('unknown')).toBeUndefined();
    expect(hasNodeFunctionContract('unknown')).toBe(false);
  });

  it('does not expose mutable internal catalog data', () => {
    const router = getNodeFunctionContract('router')!;
    router.name = 'Changed';
    router.selectionCriteria.push('Changed criterion.');
    const list = listNodeFunctionContracts();
    list.splice(0, 1);
    expect(getNodeFunctionContract('router')?.name).toBe('Router');
    expect(getNodeFunctionContract('router')?.selectionCriteria).not.toContain('Changed criterion.');
    expect(listNodeFunctionContracts()).toHaveLength(expectedCatalogIds.length);
  });

  it('rejects duplicate catalog IDs', () => {
    expect(nodeFunctionCatalogSchema.safeParse([routerNodeFunctionContract, routerNodeFunctionContract]).success).toBe(false);
  });

  it('rejects unknown, platform-specific, and runtime implementation fields', () => {
    expect(safeParseNodeFunctionContract({ ...routerNodeFunctionContract, unexpected: true }).success).toBe(false);
    expect(safeParseNodeFunctionContract({ ...routerNodeFunctionContract, n8nNodeType: 'switch' }).success).toBe(false);
    expect(safeParseNodeFunctionContract({ ...routerNodeFunctionContract, name: 'Zapier Paths Router' }).success).toBe(false);
    expect(safeParseNodeFunctionContract({ ...routerNodeFunctionContract, runtimeConfiguration: {} }).success).toBe(false);
  });

  it('exports the catalog contract through the knowledge package index', () => {
    expect(publicKnowledge.nodeFunctionContractSchema).toBe(nodeFunctionContractSchema);
    expect(publicKnowledge.getNodeFunctionContract('router')).toEqual(routerNodeFunctionContract);
  });
});

describe('Router behavior contract', () => {
  it('parses as a valid detailed routing contract', () => {
    expect(parseNodeFunctionContract(routerNodeFunctionContract)).toEqual(routerNodeFunctionContract);
    expect(routerNodeFunctionContract.category).toBe('routing');
    expect(routerNodeFunctionContract.status).toBe('detailed');
  });

  it('requires semantic labels and prohibits generic labels', () => {
    const routes = routerNodeFunctionContract.outputRequirements.find((output) => output.id === 'semantic-routes')!;
    expect(routes.semanticLabelRequired).toBe(true);
    expect(routes.genericLabelsAllowed).toBe(false);
    expect(routes.minimumCount).toBeGreaterThanOrEqual(2);
    expect(routerNodeFunctionContract.negativeExamples.some((example) => /Output 1|Route 1|Branch 1|Path 1/i.test(example.requirementText) && !example.valid)).toBe(true);
  });

  it('marks every positive example valid', () => {
    expect(routerNodeFunctionContract.positiveExamples.every((example) => example.valid)).toBe(true);
  });

  it.each([
    ['binary decision', /binary decision/i],
    ['parallel execution', /parallel fan-out/i],
    ['iterator', /iterator/i],
    ['retry', /retry loop/i],
  ])('excludes %s examples', (_name, interpretation) => {
    expect(routerNodeFunctionContract.negativeExamples.some((example) => interpretation.test(example.expectedInterpretation) && !example.valid)).toBe(true);
  });

  it('contains no platform-specific implementation names', () => {
    expect(JSON.stringify(routerNodeFunctionContract)).not.toMatch(/n8n|make\.com|zapier|reactflow|nodeType/i);
  });

  it('maps conceptually to Workflow Brief decisions and routes', () => {
    expect(routerNodeFunctionContract.relatedWorkflowBriefEntityTypes).toEqual(expect.arrayContaining(['decision', 'route']));
  });

  it('aligns with the locked department-routing Workflow Brief fixture', () => {
    expect(safeParseCanonicalWorkflowBrief(lockedDepartmentRoutingWorkflowBrief).success).toBe(true);
    expect(lockedDepartmentRoutingWorkflowBrief.decisions[0]?.decisionType).toBe('multi-route');
    expect(lockedDepartmentRoutingWorkflowBrief.routes.map((route) => route.label)).toEqual(['IT', 'Marketing', 'Customer Support']);
  });

  it('aligns with Workflow Brief rejection of generic route labels', () => {
    const brief = structuredClone(lockedDepartmentRoutingWorkflowBrief);
    brief.routes[0]!.label = 'Route 1';
    expect(safeParseCanonicalWorkflowBrief(brief).success).toBe(false);
  });
});
