import { applicationPacks, platformCapabilities, ruleManuals, workflowPatterns } from '@awm/knowledge';
import { applicationRegistry, plannerContextSchema, type DetectedProcessSummary, type PlannerContext, type PlannerRetrievalContext, type Platform } from '@awm/shared';

const constraints = [
  'Use only operations listed in supportedOperations.',
  'Preserve every required clarification; never invent the missing policy.',
  'Prefer retrieved knowledge to model assumptions.',
  'Respect platform capability support, limitations, and alternatives.',
  'Return a canonical structured plan, not rendered nodes or coordinates.',
  'Do not add retry behavior unless a detected fact or retrieved pattern requires retry.',
];

export class PlannerContextBuilder {
  public build(objective: string, platform: Platform, analysis: DetectedProcessSummary, retrievalContext?: PlannerRetrievalContext): PlannerContext {
    const planningFacts = analysis.facts.filter((item) => item.kind !== 'uncertainty' && item.kind !== 'pattern').map((item) => ({ id: item.id, kind: item.kind, value: item.value, explanation: item.explanation, entityId: item.subject?.entityId ?? null, evidenceIds: item.evidence.map((evidence) => evidence.id) }));
    const evidenceById = new Map(analysis.facts.flatMap((fact) => fact.evidence).map((item) => [item.id, item]));
    const evidence = [...evidenceById.values()].map((item) => ({ id: item.id, evidenceType: item.evidenceType, ruleId: item.ruleId, ruleVersion: item.ruleVersion, text: item.evidenceText, explanation: item.explanation, sourceStart: item.sourceLocation.start, sourceEnd: item.sourceLocation.end }));
    const clarifications = analysis.clarifications.map((item) => ({ id: item.id, category: item.category, question: item.question, reason: item.reason, missingFact: item.missingFact, evidenceIds: item.evidence.map((evidence) => evidence.id) }));
    const retrievedIds = new Set(analysis.knowledgeContext.retrieved.map((item) => item.id));
    const operations = this.selectOperations(objective, analysis, retrievedIds);
    const manuals = ruleManuals.filter((manual) => retrievedIds.has(manual.id)).map((manual) => ({ kind: 'manual' as const, id: manual.id, title: manual.title, purpose: manual.guidance, canonicalFunctionId: null, applicationId: null, operationId: null, support: null, requiredInputs: [], outputs: [], limitations: [], alternatives: [] }));
    const applications = applicationRegistry.filter((application) => retrievedIds.has(application.id)).map((application) => { const hasPack = applicationPacks.some((pack) => pack.applicationId === application.id); return { kind: 'application' as const, id: application.id, title: application.name, purpose: `Registered ${application.category} application.`, canonicalFunctionId: null, applicationId: application.id, operationId: null, support: hasPack ? 'native' as const : 'unknown' as const, requiredInputs: [], outputs: [], limitations: hasPack ? [] : ['No verified K2 operation pack is available; operation names must not be inferred from the registry alone.'], alternatives: hasPack ? [] : ['Use a verified native connector capability or retrieve the Generic API operation pack.'] }; });
    const patterns = workflowPatterns.filter((pattern) => retrievedIds.has(pattern.id)).map((pattern) => ({ kind: 'pattern' as const, id: pattern.id, title: pattern.title, purpose: pattern.purpose, canonicalFunctionId: null, applicationId: null, operationId: null, support: null, requiredInputs: pattern.requiredSignals, outputs: pattern.canonicalFunctions, limitations: pattern.requiredClarifications, alternatives: [] }));
    const knowledge = operations.map((operation) => { const mapping = operation.knownPlatformMappings.find((item) => item.platform === platform); return { kind: 'operation' as const, id: `${operation.applicationId}.${operation.operationId}`, title: operation.title, purpose: operation.purpose, canonicalFunctionId: operation.canonicalFunctionId, applicationId: operation.applicationId, operationId: operation.operationId, support: mapping?.support ?? 'unknown' as const, requiredInputs: operation.requiredInputs.map((field) => field.key), outputs: operation.outputs.map((field) => field.key), limitations: [...operation.limitations, ...(mapping?.limitation ? [mapping.limitation] : [])], alternatives: [...operation.alternatives, ...(mapping?.alternative ? [mapping.alternative] : [])] }; });
    const functionIds = new Set(planningFacts.filter((fact) => fact.kind === 'workflow_function' || fact.kind === 'decision').map((fact) => fact.value === 'binary-condition' || fact.value === 'multi-route-decision' ? fact.value : fact.value));
    for (const operation of operations) functionIds.add(operation.canonicalFunctionId);
    const capabilities = platformCapabilities.filter((capability) => capability.platform === platform && functionIds.has(capability.canonicalFunctionId)).map((capability) => ({ kind: 'capability' as const, id: capability.id, title: capability.implementation, purpose: `Platform implementation for ${capability.canonicalFunctionId}.`, canonicalFunctionId: capability.canonicalFunctionId, applicationId: null, operationId: null, support: capability.support, requiredInputs: [], outputs: [], limitations: capability.limitation ? [capability.limitation] : [], alternatives: capability.alternative ? [capability.alternative] : [] }));
    const allowedCanonicalFunctions = [...new Set(['trigger', 'action', 'end', ...capabilities.map((item) => item.canonicalFunctionId).filter(Boolean), ...knowledge.map((item) => item.canonicalFunctionId).filter(Boolean)])];
    return plannerContextSchema.parse({ version: '1.0', objective, platform, facts: planningFacts, evidence, clarifications, patterns, knowledge: [...applications, ...manuals, ...knowledge], capabilities, allowedApplications: applications.map((item) => item.id), allowedCanonicalFunctions, supportedOperations: knowledge.filter((operation) => operation.support !== 'unsupported').map((operation) => operation.id), constraints, ...(retrievalContext ? { retrievalContext } : {}) });
  }

  private selectOperations(objective: string, analysis: DetectedProcessSummary, retrievedIds: Set<string>) {
    const clauses = objective.split(/(?<=[.!?;])|\n|,\s+(?=(?:then\s+)?(?:retrieve|fetch|find|search|create|update|upload|send|notify|log|add|append|validate|wait|fulfill|schedule|route)\b)|\s+\bthen\b\s+/i).map((item) => item.trim().toLowerCase()).filter(Boolean);
    const detectedNames = new Set(analysis.facts.filter((fact) => fact.kind === 'application').map((fact) => fact.value.toLowerCase()));
    const verbAliases: Record<string, string[]> = { retrieve: ['retrieve', 'get', 'load'], get: ['retrieve', 'get', 'load'], find: ['find', 'search', 'lookup'], search: ['find', 'search', 'lookup'], create: ['create', 'add'], add: ['add', 'append', 'log', 'create'], append: ['append', 'add', 'log'], send: ['send', 'notify', 'follow-up', 'follow up'], update: ['update'], upload: ['upload'] };
    let previousApplications = new Set<string>();
    const clauseApplications = clauses.map((clause) => {
      const explicit = new Set(applicationPacks.filter((pack) => [pack.name, ...pack.aliases].some((name) => name.length >= 3 && clause.includes(name.toLowerCase()))).map((pack) => pack.applicationId));
      if (explicit.size) previousApplications = explicit;
      return explicit.size ? explicit : new Set(previousApplications);
    });
    const candidates = applicationPacks.flatMap((pack) => pack.operations.map((operation) => ({ pack, operation }))).flatMap(({ pack, operation }) => {
      const ref = `${operation.applicationId}.${operation.operationId}`; const packNames = [pack.name, ...pack.aliases].map((item) => item.toLowerCase()).filter((item) => item.length >= 3);
      if (!detectedNames.has(pack.name.toLowerCase())) return [];
      if (operation.acceptedInputCardinality.length === 1 && operation.acceptedInputCardinality[0] === 'collection' && !analysis.facts.some((fact) => fact.kind === 'cardinality' && fact.value === 'collection' && (!fact.subject?.entityId || operation.title.toLowerCase().includes(fact.subject.entityId)))) return [];
      const operationWords = operation.title.toLowerCase().split(/\s+/); const aliases = verbAliases[operationWords[0]!] ?? [operationWords[0]!]; const entities = operationWords.slice(1).filter((word) => word.length > 2);
      return clauses.flatMap((clause, clauseIndex) => {
        if (!clauseApplications[clauseIndex]?.has(pack.applicationId) && !packNames.some((name) => clause.includes(name))) return [];
        const verbMatch = aliases.some((verb) => new RegExp(`\\b${verb.replaceAll(' ', '[ -]?')}(?:s|d|ing)?\\b`, 'i').test(clause));
        const entityMatches = entities.filter((entity) => clause.includes(entity)).length;
        const score = (verbMatch ? 4 : 0) + Math.min(4, entityMatches * 2) + (retrievedIds.has(ref) ? 1 : 0);
        return score > 0 ? [{ operation, clauseIndex, score }] : [];
      });
    }).filter((item): item is { operation: (typeof applicationPacks)[number]['operations'][number]; clauseIndex: number; score: number } => Boolean(item));
    const bestByClauseAndApplication = new Map<string, number>();
    for (const candidate of candidates) {
      const key = `${candidate.clauseIndex}:${candidate.operation.applicationId}`;
      bestByClauseAndApplication.set(key, Math.max(bestByClauseAndApplication.get(key) ?? 0, candidate.score));
    }
    return [...new Map(candidates.filter((candidate) => candidate.score === bestByClauseAndApplication.get(`${candidate.clauseIndex}:${candidate.operation.applicationId}`)).map((candidate) => [`${candidate.operation.applicationId}.${candidate.operation.operationId}`, candidate.operation])).values()];
  }
}
