import { z } from 'zod';

const uuidSchema = z.string().uuid();
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function objects(value: unknown): JsonObject[] { return Array.isArray(value) ? value.filter(isObject) : []; }
function validUuid(value: unknown): value is string { return uuidSchema.safeParse(value).success; }

export function repairWorkflowCandidate(value: unknown): { value: unknown; repairs: string[] } {
  if (!isObject(value)) return { value, repairs: [] };
  const candidate = structuredClone(value);
  const repairs: string[] = [];
  const nodeIdMap = new Map<string, string>();
  const usedNodeIds = new Set<string>();

  const workflowKeys = new Set(['schemaVersion', 'id', 'name', 'summary', 'objective', 'targetPlatform', 'confidence', 'actors', 'systems', 'nodes', 'connections', 'branches', 'errorHandling', 'clarificationQuestions', 'risks', 'complexity', 'assumptions', 'missingInformation', 'warnings', 'recommendations', 'completionCriteria', 'estimatedExecutionTime', 'createdAt', 'updatedAt']);
  for (const key of Object.keys(candidate)) if (!workflowKeys.has(key)) { delete candidate[key]; repairs.push('misplaced workflow property removed'); }
  for (const key of ['summary', 'objective', 'estimatedExecutionTime'] as const) if (candidate[key] === null) { delete candidate[key]; repairs.push(`${key} default supplied`); }
  for (const key of ['actors', 'systems', 'nodes', 'connections', 'branches', 'errorHandling', 'clarificationQuestions', 'risks', 'assumptions', 'missingInformation', 'warnings', 'recommendations', 'completionCriteria'] as const) if (candidate[key] === null) { delete candidate[key]; repairs.push(`${key} default supplied`); }

  if (!validUuid(candidate.id)) { candidate.id = crypto.randomUUID(); repairs.push('workflow ID normalized'); }
  const now = new Date().toISOString();
  if (typeof candidate.createdAt !== 'string') { candidate.createdAt = now; repairs.push('created timestamp supplied'); }
  if (typeof candidate.updatedAt !== 'string') { candidate.updatedAt = now; repairs.push('updated timestamp supplied'); }
  for (const [nodeIndex, node] of objects(candidate.nodes).entries()) {
    const original = typeof node.id === 'string' ? node.id : '';
    const id = validUuid(node.id) && !usedNodeIds.has(node.id) ? node.id : crypto.randomUUID();
    if (id !== node.id) repairs.push('node ID normalized');
    if (original) nodeIdMap.set(original, id);
    node.id = id; usedNodeIds.add(id);
    if (typeof node.name !== 'string' || !node.name.trim()) { node.name = `Workflow step ${nodeIndex + 1}`; repairs.push('empty node name supplied'); }
    for (const key of ['description', 'purpose', 'expectedResult', 'icon', 'estimatedExecution', 'notes'] as const) {
      if (node[key] === null) { delete node[key]; repairs.push(`${key} default supplied`); }
    }
    for (const key of ['bestPractices', 'potentialErrors', 'alternativeImplementations', 'performanceNotes', 'securityNotes'] as const) {
      if (node[key] === null) { delete node[key]; repairs.push(`${key} default supplied`); }
    }
    for (const key of ['inputs', 'outputs', 'credentials', 'configuration', 'conditions'] as const) if (node[key] === null) { delete node[key]; repairs.push(`${key} default supplied`); }
    for (const key of ['status', 'configurationCompleteness', 'riskLevel'] as const) if (node[key] === null) { delete node[key]; repairs.push(`${key} default supplied`); }
    if (node.retryPolicy === null) { delete node.retryPolicy; repairs.push('empty retry policy removed'); }
    if (typeof node.timeoutSeconds === 'number' && node.timeoutSeconds <= 0) { delete node.timeoutSeconds; repairs.push('non-positive timeout removed'); }
    if (isObject(node.retryPolicy)) {
      const backoff = node.retryPolicy.backoff;
      if (!['none', 'fixed', 'exponential'].includes(typeof backoff === 'string' ? backoff : '')) { node.retryPolicy.backoff = backoff === 'linear' ? 'fixed' : 'fixed'; repairs.push('retry backoff normalized'); }
      if (typeof node.retryPolicy.attempts === 'number') node.retryPolicy.attempts = Math.max(0, Math.min(10, Math.round(node.retryPolicy.attempts)));
    }
  }
  const remapNode = (item: JsonObject, key: string) => { const current = item[key]; if (typeof current === 'string' && nodeIdMap.has(current)) item[key] = nodeIdMap.get(current); };
  const usedConnectionIds = new Set<string>();
  for (const connection of objects(candidate.connections)) {
    if (!validUuid(connection.id) || usedConnectionIds.has(connection.id)) { connection.id = crypto.randomUUID(); repairs.push('connection ID normalized'); }
    usedConnectionIds.add(connection.id as string); remapNode(connection, 'sourceNodeId'); remapNode(connection, 'targetNodeId');
    for (const key of ['label', 'sourcePort', 'targetPort', 'routeType', 'style', 'mappings'] as const) if (connection[key] === null) { delete connection[key]; repairs.push(`${key} default supplied`); }
    for (const mapping of objects(connection.mappings)) if (mapping.id !== undefined && !validUuid(mapping.id)) { mapping.id = crypto.randomUUID(); repairs.push('mapping ID normalized'); }
  }
  for (const branch of objects(candidate.branches)) { normalizeId(branch, repairs, 'branch'); remapNode(branch, 'sourceNodeId'); remapNode(branch, 'destinationNodeId'); }
  for (const rule of objects(candidate.errorHandling)) { normalizeId(rule, repairs, 'error rule'); remapNode(rule, 'nodeId'); remapNode(rule, 'fallbackNodeId'); remapNode(rule, 'notificationNodeId'); }
  for (const question of objects(candidate.clarificationQuestions)) { normalizeId(question, repairs, 'question'); remapNode(question, 'relatedNodeId'); }
  for (const risk of objects(candidate.risks)) { normalizeId(risk, repairs, 'risk'); remapNode(risk, 'nodeId'); }
  return { value: candidate, repairs: [...new Set(repairs)] };
}

function normalizeId(item: JsonObject, repairs: string[], label: string): void {
  if (!validUuid(item.id)) { item.id = crypto.randomUUID(); repairs.push(`${label} ID normalized`); }
}
