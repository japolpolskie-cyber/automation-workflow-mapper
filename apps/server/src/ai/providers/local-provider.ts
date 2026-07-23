import { aiAttachmentPortFor, leadQualificationWorkflow, type CanonicalWorkflow, type SemanticRequirementAnalysis, type SemanticRequirementUnit, type WorkflowBranch, type WorkflowConnection, type WorkflowNode } from '@awm/shared';
import type { AnalysisProvider, AnalysisProviderInput } from './analysis-provider.js';
import { SemanticRequirementAnalyzer } from '../../analysis/semantic-requirement-analyzer.js';

const serviceNames = ['Asana', 'Google Drive', 'Salesforce', 'HubSpot', 'GoHighLevel', 'Slack', 'Microsoft Teams', 'Google Sheets', 'Airtable', 'Apollo', 'Facebook Lead Ads', 'Gmail', 'Outlook', 'Notion', 'Shopify', 'Stripe', 'Twilio'];
const boilerplate = /\b(we are seeking|skilled .+ expert|scope of work|essential for improving|help us streamline|job description|ideal candidate|responsibilit(?:y|ies)|qualification|deliverable)\b/i;
const heading = /(?:automation|workflow|process|overview|objective|project)$/i;
const operationalStart = /^(automatically\s+|create\s+|include\s+|send\s+|update\s+|add\s+|check\s+|wait\s+|notify\s+|log\s+|search\s+|find\s+|validate\s+|move\s+|upload\s+)/i;

const makeNode = (category: WorkflowNode['category'], name: string, service: string | null, operation: string, description = ''): WorkflowNode => ({ id: crypto.randomUUID(), category, name, description, service, operation, purpose: description, expectedResult: '', icon: 'generic-action', estimatedExecution: category === 'delay' ? 'Depends on configured wait' : 'Under 1 minute', inputs: [], outputs: [], credentials: service ? [`${service} connection`] : [], configuration: {}, status: 'incomplete', configurationCompleteness: 35, conditions: [], decisionRule: null, notes: '', bestPractices: [], potentialErrors: [], alternativeImplementations: [], performanceNotes: [], securityNotes: [], riskLevel: ['api_request', 'database', 'crm'].includes(category) ? 'high' : 'low' });
const connect = (sourceNodeId: string, targetNodeId: string, label = '', branchLabel: WorkflowConnection['branchLabel'] = null, condition: string | null = null): WorkflowConnection => ({ id: crypto.randomUUID(), sourceNodeId, targetNodeId, sourcePort: 'output', targetPort: 'input', label, branchLabel, style: branchLabel ? 'conditional' : 'default', condition, routeType: branchLabel ? 'conditional' : 'success', mappings: [] });
const semanticAnalyzer = new SemanticRequirementAnalyzer();

export class LocalAnalysisProvider implements AnalysisProvider {
  public readonly name = 'local' as const;
  public async analyze(input: AnalysisProviderInput): Promise<unknown> {
    if (/facebook lead ads/i.test(input.scope) && /apollo/i.test(input.scope) && /hubspot/i.test(input.scope)) {
      const now = new Date().toISOString();
      return { ...structuredClone(leadQualificationWorkflow), id: crypto.randomUUID(), name: input.projectName, targetPlatform: input.platform, createdAt: now, updatedAt: now };
    }
    const now = new Date().toISOString();
    const { nodes, connections, branches, compressionReport } = extractOperationalArchitecture(input.scope, input.platform, input.workflowMode === 'single');
    if (!nodes.length) nodes.push(makeNode('trigger', 'Workflow trigger to be confirmed', null, 'Receive event', 'Start the automation when the agreed business event occurs.'));
    const systems = [...new Set(nodes.map((node) => node.service).filter((value): value is string => Boolean(value)))].map((name) => ({ name, category: 'application' }));
    const missingInformation = [nodes.some((node) => node.category === 'trigger' && !node.service) ? 'Application that provides the trigger' : '', /text messages|sms/i.test(input.scope) && !/twilio|clicksend/i.test(input.scope) ? 'Approved SMS provider and sender' : '', /email/i.test(input.scope) && !/gmail|outlook|smtp/i.test(input.scope) ? 'Approved email provider and sender' : '', !/\b(error|fail|retry|fallback)\b/i.test(input.scope) ? 'Required failure behavior' : ''].filter(Boolean);
    const clarificationQuestions = missingInformation.map((missing) => ({ id: crypto.randomUUID(), question: `Please confirm: ${missing}.`, category: /provider|application/i.test(missing) ? 'system' as const : 'error_handling' as const, required: true, answer: null, relatedNodeId: null }));
    const compressionWarning = compressionReport
      ? `Semantic compression reduced ${compressionReport.initialNodeCount} draft nodes to ${compressionReport.finalNodeCount} visible nodes across ${compressionReport.mergedNodeGroups.length} compound operation groups.`
      : '';
    const workflow: CanonicalWorkflow = { schemaVersion: '2.0', id: crypto.randomUUID(), name: input.projectName, summary: summarize(input.scope), objective: summarize(input.scope), targetPlatform: input.platform, confidence: nodes.length > 2 ? 0.68 : 0.45, actors: [], systems, nodes, connections, branches, errorHandling: [], clarificationQuestions, risks: [], complexity: branches.length || nodes.length >= 6 ? 'moderate' : 'simple', assumptions: [], missingInformation, warnings: ['Free deterministic fallback extracted supported explicit process steps. Review application choices and unresolved business rules before implementation.', compressionWarning].filter(Boolean), recommendations: ['Confirm messaging providers where the scope permits email or SMS alternatives.'], completionCriteria: [], estimatedExecutionTime: '', createdAt: now, updatedAt: now };
    return workflow;
  }
  public async getStatus() { return { provider: this.name, available: true, models: ['deterministic-local-preview'], message: 'Local preview is ready.' }; }
}

interface CompressionReport {
  initialNodeCount: number;
  finalNodeCount: number;
  mergedNodeGroups: Array<{ compoundNodeId: string; section: string; mergedNodeIds: string[] }>;
  preservedStandaloneNodes: Array<{ nodeId: string; reason: string }>;
}

interface ExtractedArchitecture {
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  branches: WorkflowBranch[];
  compressionReport?: CompressionReport;
}

function extractOperationalArchitecture(scope: string, platform: AnalysisProviderInput['platform'], forceSingleWorkflow = false): ExtractedArchitecture {
  const portfolio = extractPortfolioArchitecture(scope, platform, forceSingleWorkflow);
  if (portfolio) return portfolio;
  const explicitSequence = extractExplicitWorkflowSequence(scope);
  if (explicitSequence) return explicitSequence;
  const semantic = semanticAnalyzer.analyze(scope);
  if (hasOwnedSemanticStructure(semantic)) return buildSemanticFallback(semantic);
  if (!/^\s*(?:trigger|action)\s*:/im.test(scope) && /\b(?:when|whenever|upon)\b/i.test(scope)) return addEvidenceBasedIterators(extractProceduralArchitecture(scope), platform);
  const lines = scope.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const nodes: WorkflowNode[] = []; const connections: WorkflowConnection[] = []; const branches: WorkflowBranch[] = [];
  let previous: WorkflowNode | null = null; let section = '';
  for (const raw of lines) {
    if (/^scope of work:?$/i.test(raw) || boilerplate.test(raw)) continue;
    if (!/^trigger\s*:/i.test(raw) && !/^action\s*:/i.test(raw) && heading.test(raw) && !operationalStart.test(raw)) { section = raw; continue; }
    const triggerMatch = raw.match(/^trigger\s*:\s*(.+)$/i);
    if (triggerMatch) {
      const detail = triggerMatch[1]!.trim(); const service = findService(`${detail} ${section}`);
      const node = makeNode('trigger', triggerTitle(detail, service), service, triggerOperation(detail), detail);
      nodes.push(node); previous = node; continue;
    }
    const actionText = raw.replace(/^action\s*:\s*/i, '').trim();
    if (!actionText || (!/^action\s*:/i.test(raw) && !operationalStart.test(actionText))) continue;
    const service = actionService(actionText, section); const category = actionCategory(actionText);
    const node = makeNode(category, actionTitle(actionText), service, actionOperation(actionText), actionText);
    nodes.push(node); if (previous) connections.push(connect(previous.id, node.id)); previous = node;
  }
  return { nodes, connections, branches };
}

function hasOwnedSemanticStructure(analysis: SemanticRequirementAnalysis): boolean {
  return analysis.units.some((unit) => unit.kind === 'ai-resource' || unit.kind === 'route' || unit.kind === 'branch');
}

function buildSemanticFallback(analysis: SemanticRequirementAnalysis): ExtractedArchitecture {
  const nodes: WorkflowNode[] = [];
  const connections: WorkflowConnection[] = [];
  const branches: WorkflowBranch[] = [];
  const nodesByUnit = new Map<string, WorkflowNode>();
  const routesByRouter = new Map<string, SemanticRequirementUnit[]>();
  const branchTails: WorkflowNode[] = [];
  let tails: WorkflowNode[] = [];

  const append = (node: WorkflowNode) => {
    for (const tail of tails) connections.push(connect(tail.id, node.id));
    nodes.push(node);
    tails = [node];
    return node;
  };

  for (const unit of analysis.units) {
    if (unit.kind === 'route' && unit.parentId) {
      const routes = routesByRouter.get(unit.parentId) ?? [];
      routes.push(unit);
      routesByRouter.set(unit.parentId, routes);
      continue;
    }
    if ((!unit.executable && unit.kind !== 'ai-resource') || unit.kind === 'branch') {
      continue;
    }

    if (unit.kind === 'trigger') {
      const webhook = /\bwebhook\b/i.test(unit.text);
      const node = append(makeNode(webhook ? 'webhook' : 'trigger', webhook ? 'Webhook — Receive request' : sentenceTitle(unit.text), webhook ? 'Webhook' : findService(unit.text), 'Receive event', unit.text));
      nodesByUnit.set(unit.id, node);
      continue;
    }

    if (unit.kind === 'ai-agent') {
      const node = append(makeNode('ai', 'AI Agent — Analyze request', 'n8n', 'AI Agent', unit.text));
      nodesByUnit.set(unit.id, node);
      continue;
    }

    if (unit.kind === 'ai-resource' && unit.parentId) {
      const agent = nodesByUnit.get(unit.parentId);
      if (!agent) continue;
      const attachmentType = /memory/i.test(unit.text) ? 'memory' as const : /model/i.test(unit.text) ? 'chat-model' as const : 'tool' as const;
      const node = {
        ...makeNode('ai', sentenceTitle(unit.text), null, sentenceTitle(unit.text), unit.text),
        nodeKind: 'ai-attachment' as const,
        attachmentType,
        attachmentSubtype: unit.text,
        attachmentStatus: 'unconfigured' as const,
      };
      const connectionKind = aiAttachmentPortFor(attachmentType);
      nodes.push(node);
      connections.push({
        ...connect(node.id, agent.id, sentenceTitle(unit.text)),
        connectionKind,
        sourcePort: 'attachment',
        targetPort: connectionKind,
      });
      nodesByUnit.set(unit.id, node);
      continue;
    }

    if (unit.kind === 'router') {
      const node = append(makeNode('router', 'Route by department', null, 'Evaluate routes', unit.text));
      nodesByUnit.set(unit.id, node);
      continue;
    }

    if (unit.kind === 'binary-condition') {
      const node = append(makeNode('condition', 'Is the request high priority?', null, 'Evaluate condition', unit.text));
      node.decisionRule = { decisionQuestion: node.name, field: 'highPriority', operator: 'equals', comparisonValue: true, trueLabel: 'TRUE', falseLabel: 'FALSE' };
      nodesByUnit.set(unit.id, node);
      tails = [];
      continue;
    }

    if (unit.kind === 'temporal-wait' || unit.kind === 'event-wait') {
      const node = append(makeNode('delay', sentenceTitle(unit.text), null, unit.kind === 'event-wait' ? 'Wait for event' : 'Wait', unit.text));
      nodesByUnit.set(unit.id, node);
      continue;
    }

    if (unit.kind === 'operation') {
      const category = actionCategory(unit.text);
      const node = makeNode(category, semanticOperationTitle(unit.text), actionService(unit.text, ''), actionOperation(unit.text), unit.text);
      const parent = unit.parentId ? analysis.units.find((candidate) => candidate.id === unit.parentId) : undefined;

      if (parent?.kind === 'router') {
        const routerNode = nodesByUnit.get(parent.id);
        if (!routerNode) continue;
        nodes.push(node);
        for (const route of routesByRouter.get(parent.id) ?? []) {
          connections.push({ ...connect(routerNode.id, node.id, route.text, null, `Department equals ${route.text}`), routeType: 'conditional', style: 'conditional' });
          branches.push({ id: crypto.randomUUID(), sourceNodeId: routerNode.id, name: route.text, condition: { combinator: 'and', rules: [{ field: 'department', operator: 'equals', value: route.text }] }, destinationNodeId: node.id, isDefault: false });
        }
        tails = [node];
      } else if (parent?.kind === 'branch' && parent.parentId) {
        const decision = nodesByUnit.get(parent.parentId);
        if (!decision || !parent.branchLabel) continue;
        nodes.push(node);
        connections.push(connect(decision.id, node.id, parent.branchLabel, parent.branchLabel, parent.branchLabel === 'TRUE' ? 'Condition is true' : 'Condition is false'));
        branches.push({ id: crypto.randomUUID(), sourceNodeId: decision.id, name: parent.branchLabel, condition: { combinator: 'and', rules: [{ field: 'highPriority', operator: 'equals', value: parent.branchLabel === 'TRUE' }] }, destinationNodeId: node.id, isDefault: parent.branchLabel === 'FALSE' });
        branchTails.push(node);
      } else {
        append(node);
      }
      nodesByUnit.set(unit.id, node);
      continue;
    }

    if (unit.kind === 'terminal-outcome') {
      const node = makeNode('end', 'End — Request handled', null, 'End workflow', unit.text);
      const sources = branchTails.length ? branchTails : tails;
      nodes.push(node);
      for (const source of sources) connections.push(connect(source.id, node.id));
      tails = [node];
      branchTails.length = 0;
      nodesByUnit.set(unit.id, node);
    }
  }

  return { nodes, connections, branches };
}

function semanticOperationTitle(text: string): string {
  if (/each route\b.*ticket/i.test(text)) return 'Create department ticket';
  if (/slack/i.test(text)) return 'Send urgent Slack notification';
  if (/google sheets/i.test(text)) return 'Log request in Google Sheets';
  return actionTitle(text);
}

export function isLargeWorkflowPortfolio(scope: string): boolean {
  return scope.length >= 10_000 && portfolioSections(scope).length >= 4 && countIndependentWorkflowTriggers(scope) > 1;
}

function portfolioSections(scope: string): Array<{ title: string; body: string }> {
  const lines = scope.split(/\r?\n/);
  const headings: Array<{ index: number; title: string }> = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const title = lines[index]!.trim();
    if (!title || (index > 0 && lines[index - 1]!.trim()) || lines[index + 1]!.trim()) continue;
    if (title.length > 70 || /[:.!?]$/.test(title) || !/^[A-Z][A-Za-z0-9 &'/-]+$/.test(title)) continue;
    if (/^(?:Hi|General Requirements|Important Workflows)$/i.test(title)) continue;
    headings.push({ index, title });
  }
  return headings.map((heading, position) => ({
    title: heading.title,
    body: lines.slice(heading.index + 1, headings[position + 1]?.index ?? lines.length).join('\n').trim(),
  })).filter((section) => section.body.length >= 40);
}

export function countIndependentWorkflowTriggers(scope: string): number {
  const lines = scope.split(/\r?\n/).map((line) => line.trim());
  const explicitTriggers: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const inline = lines[index]!.match(/^trigger\s*:\s*(.+)$/i);
    if (inline) explicitTriggers.push(inline[1]!.trim());
    else if (/^trigger\s*:?\s*$/i.test(lines[index]!)) {
      const next = lines.slice(index + 1).find(Boolean);
      if (next) explicitTriggers.push(next);
    }
  }
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (explicitTriggers.length) return new Set(explicitTriggers.map(normalize).filter(Boolean)).size;

  const sectionTriggers = portfolioSections(scope).flatMap((section) => {
    const firstStatement = section.body.split(/\r?\n|(?<=[.!?])\s+/).map((item) => item.trim()).find(Boolean) ?? '';
    const hasEvent = /^(?:when|whenever|upon|on receipt of|on submission of)\s+\S|^every\s+(?:business\s+day|weekday|day|week|month|quarter|year)\b/i.test(firstStatement);
    return hasEvent ? [`${section.title}: ${firstStatement}`] : [];
  });
  if (sectionTriggers.length) return new Set(sectionTriggers.map(normalize)).size;

  const documentTriggers = lines.flatMap((line) => {
    const hasEvent = /^(?:when|whenever|upon|on receipt of|on submission of)\s+\S|^every\s+(?:business\s+day|weekday|day|week|month|quarter|year)\b/i.test(line);
    return hasEvent ? [line] : [];
  });
  return Math.max(1, new Set(documentTriggers.map(normalize).filter(Boolean)).size);
}

export function requestsSingleWorkflow(scope: string) {
  return /\b(?:create|build|generate|produce|keep|use|remain|as)\s+(?:this\s+as\s+|a\s+)?single workflow\b|\b(?:one|single)\s+(?:complete\s+|complex\s+)?workflow\b|\bdo not\s+(?:split|separate).{0,40}\b(?:workflow|tabs?)\b|\bwithout\s+(?:separate\s+)?(?:workflow\s+)?tabs?\b/i.test(scope);
}

export function shouldPartitionWorkflowScope(scope: string, forceSingleWorkflow = false) {
  return !forceSingleWorkflow
    && !requestsSingleWorkflow(scope)
    && portfolioSections(scope).length >= 2
    && countIndependentWorkflowTriggers(scope) > 1;
}

interface PortfolioCapability {
  key: string;
  title: string;
  sections: Array<{ title: string; body: string }>;
}

const propertyCapability = (title: string): Pick<PortfolioCapability, 'key' | 'title'> | null => {
  if (/\b(?:inquir(?:y|ies)|prospects?|lead qualification|viewings?|post-viewing)\b/i.test(title)) return { key: 'leasing-prospects', title: 'Leasing & Prospect Management' };
  if (/\b(?:rental application|screening|multiple applicants?)\b/i.test(title)) return { key: 'application-screening', title: 'Application Screening & Decision' };
  if (/\b(?:application approval|conditional approval|lease signing|deposit|tenant onboarding|move-in)\b/i.test(title)) return { key: 'tenant-onboarding', title: 'Lease & Tenant Onboarding' };
  if (/\b(?:maintenance|contractor)\b/i.test(title)) return { key: 'maintenance', title: 'Maintenance Operations' };
  if (/\b(?:rent collection|partial\b.*\bpayments?|failed payments?|payment collection)\b/i.test(title)) return { key: 'rent-payments', title: 'Rent & Payment Operations' };
  if (/\b(?:renewals?|move-out|offboarding)\b/i.test(title)) return { key: 'renewal-offboarding', title: 'Renewal & Move-Out' };
  if (/\b(?:owner reporting|vacancy|portfolio reporting)\b/i.test(title)) return { key: 'owner-operations', title: 'Owner & Vacancy Operations' };
  if (/\b(?:complaints?|escalations?|duplicate|audit|error handling|governance)\b/i.test(title)) return { key: 'risk-governance', title: 'Risk, Data Integrity & Automation Governance' };
  return null;
};

const generalCapability = (title: string): Pick<PortfolioCapability, 'key' | 'title'> | null => {
  if (/\b(?:lead|prospect|sales|marketing|campaign|acquisition)\b/i.test(title)) return { key: 'customer-acquisition', title: 'Customer Acquisition & Sales' };
  if (/\b(?:application|assessment|screening|qualification|approval|decision)\b/i.test(title)) return { key: 'assessment-decision', title: 'Assessment & Decision Management' };
  if (/\b(?:onboarding|implementation|fulfillment|delivery|activation)\b/i.test(title)) return { key: 'onboarding-delivery', title: 'Onboarding & Service Delivery' };
  if (/\b(?:support|maintenance|ticket|request|case|incident)\b/i.test(title)) return { key: 'service-operations', title: 'Service & Support Operations' };
  if (/\b(?:invoice|payment|billing|collection|finance)\b/i.test(title)) return { key: 'payment-processing', title: 'Payment & Finance Operations' };
  if (/\b(?:renewal|retention|offboarding|closure|cancellation)\b/i.test(title)) return { key: 'retention-offboarding', title: 'Retention & Offboarding' };
  if (/\b(?:report|monitor|analytics|inventory|vacancy)\b/i.test(title)) return { key: 'reporting-monitoring', title: 'Reporting & Monitoring' };
  if (/\b(?:complaint|escalation|duplicate|audit|error|governance|compliance)\b/i.test(title)) return { key: 'risk-governance', title: 'Risk, Compliance & Automation Governance' };
  return null;
};

function conceptualPortfolioCapabilities(scope: string): PortfolioCapability[] {
  const sections = portfolioSections(scope);
  const propertyContext = /\b(?:property|tenant|lease|rental)\b/i.test(scope);
  const capabilities: PortfolioCapability[] = [];
  const byKey = new Map<string, PortfolioCapability>();

  sections.forEach((section, index) => {
    const classified = (propertyContext ? propertyCapability(section.title) : null)
      ?? generalCapability(section.title)
      ?? { key: `integrated-operations-${Math.floor(index / 3)}`, title: `Integrated Business Operations ${Math.floor(index / 3) + 1}` };
    let capability = byKey.get(classified.key);
    if (!capability) {
      capability = { ...classified, sections: [] };
      capabilities.push(capability);
      byKey.set(classified.key, capability);
    }
    capability.sections.push(section);
  });
  return capabilities;
}

function buildPortfolioCapability(capability: PortfolioCapability, platform: AnalysisProviderInput['platform']) {
  const groupedRequirements = capability.sections
    .map((section) => `${section.title}\n${section.body}`)
    .join('\n\n');
  const architecture = addEvidenceBasedIterators(
    extractProceduralArchitecture(`When the ${capability.title} workflow begins, start the documented process.\n${groupedRequirements}`),
    platform,
  );
  const entry = architecture.nodes.find((node) => node.category === 'trigger');
  if (entry) {
    entry.name = capability.title;
    entry.description = `Start the complete ${capability.title.toLowerCase()} lifecycle.`;
    entry.purpose = entry.description;
    entry.operation = 'Start business capability';
  }
  return architecture;
}

const meaningfulPortfolioSteps = (architecture: ReturnType<typeof buildPortfolioCapability>) =>
  architecture.nodes.filter((node) => !['start', 'trigger', 'end', 'note', 'group'].includes(node.category)).length;

function applyPortfolioQualityGate(capabilities: PortfolioCapability[], platform: AnalysisProviderInput['platform']) {
  const candidates = capabilities.map((capability) => ({ capability, architecture: buildPortfolioCapability(capability, platform) }))
    .filter(({ architecture }) => architecture.nodes.length >= 2);

  while (candidates.length > 1 && candidates.filter(({ architecture }) => meaningfulPortfolioSteps(architecture) < 6).length / candidates.length > 0.3) {
    const smallIndex = candidates.findIndex(({ architecture }) => meaningfulPortfolioSteps(architecture) < 6);
    if (smallIndex < 0) break;
    const previousIsSmall = smallIndex > 0 && meaningfulPortfolioSteps(candidates[smallIndex - 1]!.architecture) < 6;
    const nextIsSmall = smallIndex < candidates.length - 1 && meaningfulPortfolioSteps(candidates[smallIndex + 1]!.architecture) < 6;
    const neighborIndex = nextIsSmall ? smallIndex + 1 : previousIsSmall ? smallIndex - 1 : smallIndex === 0 ? 1 : smallIndex - 1;
    const firstIndex = Math.min(smallIndex, neighborIndex);
    const secondIndex = Math.max(smallIndex, neighborIndex);
    const first = candidates[firstIndex]!.capability;
    const second = candidates[secondIndex]!.capability;
    const merged: PortfolioCapability = {
      key: `${first.key}-${second.key}`,
      title: `${first.title} & ${second.title}`,
      sections: [...first.sections, ...second.sections],
    };
    candidates.splice(firstIndex, 2, { capability: merged, architecture: buildPortfolioCapability(merged, platform) });
  }
  return candidates;
}

function extractPortfolioArchitecture(scope: string, platform: AnalysisProviderInput['platform'], forceSingleWorkflow = false): ExtractedArchitecture | null {
  if (!shouldPartitionWorkflowScope(scope, forceSingleWorkflow)) return null;
  const nodes: WorkflowNode[] = []; const connections: WorkflowConnection[] = []; const branches: WorkflowBranch[] = [];
  const reports: CompressionReport[] = [];
  for (const { capability, architecture } of applyPortfolioQualityGate(conceptualPortfolioCapabilities(scope), platform)) {
    const compressed = compressCapabilityArchitecture(architecture, capability);
    nodes.push(...compressed.nodes);
    connections.push(...compressed.connections);
    branches.push(...compressed.branches);
    reports.push(compressed.compressionReport);
  }
  if (!nodes.length) return null;
  const compressionReport: CompressionReport = {
    initialNodeCount: reports.reduce((total, report) => total + report.initialNodeCount, 0),
    finalNodeCount: nodes.length,
    mergedNodeGroups: reports.flatMap((report) => report.mergedNodeGroups),
    preservedStandaloneNodes: reports.flatMap((report) => report.preservedStandaloneNodes),
  };
  validateSemanticCompression({ nodes, connections, branches }, compressionReport);
  return { nodes, connections, branches, compressionReport };
}

function validateSemanticCompression(
  architecture: { nodes: WorkflowNode[]; connections: WorkflowConnection[]; branches: WorkflowBranch[] },
  report: CompressionReport,
) {
  const lowLevelItem = /\b(?:field|subfolder|recipient|document item|checklist item|template task|audit[- ]log write|retry attempt)\b/i;
  const ungroupedLowLevel = architecture.nodes.filter((node) =>
    !node.configuration.compoundOperation && lowLevelItem.test(`${node.name} ${node.description}`));
  if (architecture.nodes.length && ungroupedLowLevel.length / architecture.nodes.length > 0.25) {
    throw new Error('Semantic compression failed: more than 25% of visible nodes remain low-level implementation items.');
  }

  const bySource = new Map<string, WorkflowConnection[]>();
  for (const edge of architecture.connections) bySource.set(edge.sourceNodeId, [...(bySource.get(edge.sourceNodeId) ?? []), edge]);
  for (const edges of bySource.values()) {
    const unlabeledTargets = edges
      .filter((edge) => !edge.branchLabel && !edge.label && edge.routeType !== 'error')
      .map((edge) => architecture.nodes.find((node) => node.id === edge.targetNodeId))
      .filter((node): node is WorkflowNode => Boolean(node) && !isSemanticBoundary(node!));
    if (unlabeledTargets.length > 1) {
      throw new Error('Semantic compression failed: sibling implementation nodes share a predecessor without a meaningful branch boundary.');
    }
  }

  if (report.finalNodeCount > 100 && report.preservedStandaloneNodes.length < report.finalNodeCount - 100) {
    throw new Error('Semantic compression failed: the project exceeds 100 visible nodes without enough preserved-boundary explanations.');
  }
}

const semanticBoundaryCategories = new Set<WorkflowNode['category']>([
  'start', 'trigger', 'webhook', 'condition', 'filter', 'router', 'delay',
  'human_approval', 'retry', 'error_handler', 'loop', 'merge',
  'end',
]);

const isSemanticBoundary = (node: WorkflowNode) =>
  semanticBoundaryCategories.has(node.category)
  || (node.category === 'api_request' && /\b(?:receive|wait|callback|poll|webhook|external event)\b/i.test(`${node.name} ${node.description} ${node.operation}`));

function sectionForNode(node: WorkflowNode, capability: PortfolioCapability) {
  return capability.sections.find((section) =>
    Boolean(node.description) && section.body.toLowerCase().includes(node.description.toLowerCase()))?.title ?? capability.title;
}

function compoundOperationName(section: string, nodes: WorkflowNode[]) {
  if (nodes.every((node) => ['notification', 'email', 'messaging'].includes(node.category))) return 'Send Stakeholder Notifications';
  if (/onboarding/i.test(section)) return `Set Up ${section}`;
  if (/move-out/i.test(section)) return 'Set Up Move-Out Operations';
  if (/folder|workspace/i.test(nodes.map((node) => `${node.name} ${node.description}`).join(' '))) return `Set Up ${section}`;
  return `Complete ${section}`;
}

function compressCapabilityArchitecture(
  architecture: { nodes: WorkflowNode[]; connections: WorkflowConnection[]; branches: WorkflowBranch[] },
  capability: PortfolioCapability,
): ExtractedArchitecture & { compressionReport: CompressionReport } {
  let nodes = [...architecture.nodes];
  let connections = [...architecture.connections];
  let branches = [...architecture.branches];
  const initialNodeCount = nodes.length;
  const mergedNodeGroups: CompressionReport['mergedNodeGroups'] = [];
  const processed = new Set<string>();
  const nodeById = () => new Map(nodes.map((node) => [node.id, node]));

  for (const candidate of [...nodes]) {
    if (processed.has(candidate.id) || isSemanticBoundary(candidate)) continue;
    const section = sectionForNode(candidate, capability);
    const chain = [candidate];
    processed.add(candidate.id);
    let current = candidate;
    while (true) {
      const outgoing = connections.filter((edge) => edge.sourceNodeId === current.id && edge.routeType !== 'error');
      if (outgoing.length !== 1 || outgoing[0]!.branchLabel || outgoing[0]!.style === 'conditional') break;
      const target = nodeById().get(outgoing[0]!.targetNodeId);
      if (!target || processed.has(target.id) || isSemanticBoundary(target)) break;
      const incoming = connections.filter((edge) => edge.targetNodeId === target.id && edge.routeType !== 'error');
      if (incoming.length !== 1 || sectionForNode(target, capability) !== section) break;
      chain.push(target);
      processed.add(target.id);
      current = target;
    }
    if (chain.length < 2) continue;

    const chainIds = new Set(chain.map((node) => node.id));
    const compoundId = chain[0]!.id;
    const groupedActions = chain.map((node) => ({
      name: node.name,
      application: node.service,
      operation: node.operation,
      description: node.description,
    }));
    const services = [...new Set(chain.map((node) => node.service).filter((service): service is string => Boolean(service)))];
    const compound: WorkflowNode = {
      ...chain[0]!,
      name: compoundOperationName(section, chain),
      description: `Complete ${section.toLowerCase()} as one coordinated business operation.`,
      purpose: `Deliver the ${section.toLowerCase()} outcome without exposing its internal checklist as separate canvas nodes.`,
      service: services.length === 1 ? services[0]! : null,
      operation: 'Execute compound business operation',
      credentials: [...new Set(chain.flatMap((node) => node.credentials))],
      configuration: { ...chain[0]!.configuration, compoundOperation: true, groupedActions },
      notes: [chain[0]!.notes, `${groupedActions.length} implementation actions are grouped in this node.`].filter(Boolean).join('\n'),
      outputs: chain.at(-1)!.outputs,
      riskLevel: chain.some((node) => node.riskLevel === 'high') ? 'high' : chain.some((node) => node.riskLevel === 'medium') ? 'medium' : 'low',
    };

    nodes = nodes.filter((node) => !chainIds.has(node.id) || node.id === compoundId).map((node) => node.id === compoundId ? compound : node);
    const remapped = connections
      .filter((edge) => !(chainIds.has(edge.sourceNodeId) && chainIds.has(edge.targetNodeId)))
      .map((edge) => ({
        ...edge,
        sourceNodeId: chainIds.has(edge.sourceNodeId) ? compoundId : edge.sourceNodeId,
        targetNodeId: chainIds.has(edge.targetNodeId) ? compoundId : edge.targetNodeId,
      }));
    connections = [...new Map(remapped.filter((edge) => edge.sourceNodeId !== edge.targetNodeId)
      .map((edge) => [`${edge.sourceNodeId}:${edge.targetNodeId}:${edge.branchLabel ?? ''}:${edge.routeType}`, edge])).values()];
    branches = branches.map((branch) => ({
      ...branch,
      sourceNodeId: chainIds.has(branch.sourceNodeId) ? compoundId : branch.sourceNodeId,
      destinationNodeId: branch.destinationNodeId && chainIds.has(branch.destinationNodeId) ? compoundId : branch.destinationNodeId,
    }));
    mergedNodeGroups.push({ compoundNodeId: compoundId, section, mergedNodeIds: [...chainIds] });
  }

  const sharedEnd = makeNode(
    'end',
    `${capability.title} Complete`,
    null,
    'Complete business capability',
    `Finish the ${capability.title.toLowerCase()} lifecycle with a defined business outcome.`,
  );
  const completionEdges: WorkflowConnection[] = [];
  for (const node of nodes) {
    const outgoing = connections.filter((edge) => edge.sourceNodeId === node.id && edge.routeType !== 'error');
    if (node.category === 'condition' || node.category === 'filter') {
      const labels = new Set(outgoing.map((edge) => (edge.branchLabel || edge.label).toUpperCase()));
      const missingLabels = (['TRUE', 'FALSE'] as const).filter((label) => !labels.has(label));
      for (const label of missingLabels.slice(0, Math.max(0, 2 - outgoing.length))) {
        completionEdges.push(connect(node.id, sharedEnd.id, label, label, label));
      }
    } else if (node.category !== 'end' && outgoing.length === 0) {
      completionEdges.push(connect(node.id, sharedEnd.id, 'Completed'));
    }
  }
  if (completionEdges.length) {
    nodes.push(sharedEnd);
    connections.push(...completionEdges);
  }

  const redundantEnds = new Set(nodes.filter((node) => node.category === 'end' && node.id !== sharedEnd.id).map((node) => node.id));
  if (redundantEnds.size) {
    if (!nodes.some((node) => node.id === sharedEnd.id)) nodes.push(sharedEnd);
    nodes = nodes.filter((node) => !redundantEnds.has(node.id));
    connections = [...new Map(connections
      .map((edge) => ({
        ...edge,
        sourceNodeId: redundantEnds.has(edge.sourceNodeId) ? sharedEnd.id : edge.sourceNodeId,
        targetNodeId: redundantEnds.has(edge.targetNodeId) ? sharedEnd.id : edge.targetNodeId,
      }))
      .filter((edge) => edge.sourceNodeId !== edge.targetNodeId)
      .map((edge) => [`${edge.sourceNodeId}:${edge.targetNodeId}:${edge.branchLabel ?? ''}:${edge.routeType}`, edge])).values()];
    branches = branches.map((branch) => ({
      ...branch,
      sourceNodeId: redundantEnds.has(branch.sourceNodeId) ? sharedEnd.id : branch.sourceNodeId,
      destinationNodeId: branch.destinationNodeId && redundantEnds.has(branch.destinationNodeId) ? sharedEnd.id : branch.destinationNodeId,
    }));
    mergedNodeGroups.push({
      compoundNodeId: sharedEnd.id,
      section: capability.title,
      mergedNodeIds: [...redundantEnds],
    });
  }

  const lowLevelBranchAction = /\b(?:send|notify|update|log|upload|move|request|remind|create (?:a )?task|pause|close|generate|assign|complete|set up)\b/i;
  for (const decision of nodes.filter((node) => node.category === 'condition' || node.category === 'filter')) {
    for (const decisionEdge of [...connections.filter((edge) => edge.sourceNodeId === decision.id && edge.routeType !== 'error')]) {
      const target = nodes.find((node) => node.id === decisionEdge.targetNodeId);
      if (!target || isSemanticBoundary(target) || !lowLevelBranchAction.test(`${target.name} ${target.description}`)) continue;
      const incoming = connections.filter((edge) => edge.targetNodeId === target.id && edge.routeType !== 'error');
      const outgoing = connections.filter((edge) => edge.sourceNodeId === target.id && edge.routeType !== 'error');
      if (incoming.length !== 1 || outgoing.length !== 1) continue;
      const groupedActions = Array.isArray(target.configuration.groupedActions)
        ? target.configuration.groupedActions
        : [{ name: target.name, application: target.service, operation: target.operation, description: target.description }];
      const existingBranchActions = Array.isArray(decision.configuration.branchActions) ? decision.configuration.branchActions : [];
      decision.configuration = {
        ...decision.configuration,
        branchActions: [...existingBranchActions, {
          branch: decisionEdge.branchLabel || decisionEdge.label || 'Outcome',
          actions: groupedActions,
        }],
      };
      decision.notes = [decision.notes, `The ${decisionEdge.branchLabel || decisionEdge.label || 'outcome'} implementation actions are stored in this decision's branch metadata.`].filter(Boolean).join('\n');
      connections = connections
        .filter((edge) => edge.id !== outgoing[0]!.id)
        .map((edge) => edge.id === decisionEdge.id ? { ...edge, targetNodeId: outgoing[0]!.targetNodeId } : edge);
      branches = branches.map((branch) => branch.destinationNodeId === target.id
        ? { ...branch, destinationNodeId: outgoing[0]!.targetNodeId }
        : branch);
      nodes = nodes.filter((node) => node.id !== target.id);
      mergedNodeGroups.push({
        compoundNodeId: decision.id,
        section: sectionForNode(decision, capability),
        mergedNodeIds: [target.id],
      });
    }
  }

  const preservedStandaloneNodes = nodes
    .filter(isSemanticBoundary)
    .map((node) => ({
      nodeId: node.id,
      reason: node.category === 'condition' || node.category === 'filter' || node.category === 'router'
        ? 'Preserved as an explicit business decision or route boundary.'
        : node.category === 'delay' ? 'Preserved as an explicit timing boundary.'
          : node.category === 'human_approval' ? 'Preserved as a human decision boundary.'
            : node.category === 'retry' || node.category === 'error_handler' ? 'Preserved as an independently recoverable failure boundary.'
              : node.category === 'loop' ? 'Preserved as a collection or repetition boundary.'
                : node.category === 'api_request' || node.category === 'webhook' ? 'Preserved as an external event dependency.'
                  : 'Preserved as a workflow entry, merge, or completion boundary.',
    }));
  return {
    nodes,
    connections,
    branches,
    compressionReport: { initialNodeCount, finalNodeCount: nodes.length, mergedNodeGroups, preservedStandaloneNodes },
  };
}

function extractExplicitWorkflowSequence(scope: string): { nodes: WorkflowNode[]; connections: WorkflowConnection[]; branches: WorkflowBranch[] } | null {
  const lines = scope.split(/\r?\n/).map((line) => line.trim());
  const sequenceStart = lines.findIndex((line) => /^workflow sequence\s*:?\s*$/i.test(line));
  if (sequenceStart < 0) return null;

  const nodes: WorkflowNode[] = [];
  const connections: WorkflowConnection[] = [];
  const branches: WorkflowBranch[] = [];
  const sectionEnd = /^(?:required integrations|open questions|workflow mapping rules|mapping rules|clarifications|assumptions)\s*:?\s*$/i;

  for (const line of lines.slice(sequenceStart + 1)) {
    if (sectionEnd.test(line)) break;
    const step = line.match(/^\d+[.)]\s*(?:([^:—–-]+?)\s*(?::|—|–|-)\s*)?(.+)$/);
    if (!step) continue;

    const explicitType = step[1]?.trim() ?? '';
    const detail = step[2]!.trim();
    const fullText = `${explicitType}: ${detail}`;
    const isTrigger = nodes.length === 0 && /^(?:webhook|trigger|schedule|form|event)$/i.test(explicitType);
    const service = explicitType || findService(detail);
    const category = isTrigger ? 'trigger' : explicitStepCategory(explicitType, detail);
    const operation = isTrigger ? triggerOperation(fullText) : explicitStepOperation(explicitType, detail);
    const node = makeNode(category, sentenceTitle(fullText), service || null, operation, fullText);

    if (nodes.length) connections.push(connect(nodes.at(-1)!.id, node.id));
    nodes.push(node);
  }

  return nodes.length ? { nodes, connections, branches } : null;
}

function explicitStepCategory(type: string, detail: string): WorkflowNode['category'] {
  const value = `${type} ${detail}`;
  if (/external api|webhook|http|api request/i.test(value)) return 'api_request';
  if (/database|sql|data store/i.test(value)) return 'database';
  if (/\bemail\b/i.test(value)) return 'email';
  if (/notification|notify|alert/i.test(value)) return 'notification';
  if (/wait|delay/i.test(value)) return 'delay';
  if (/condition|if\b|decision/i.test(value)) return 'condition';
  return 'action';
}

function explicitStepOperation(type: string, detail: string): string {
  const value = `${type} ${detail}`;
  if (/external api|api request/i.test(value)) return /get|retrieve|find|search/i.test(detail) ? 'Retrieve data' : 'Call API';
  if (/database|sql/i.test(value)) return /store|insert|create|save/i.test(detail) ? 'Create record' : 'Query records';
  if (/\bemail\b/i.test(value)) return 'Send email';
  if (/notification|notify|alert/i.test(value)) return 'Send notification';
  if (/llm|language model/i.test(value)) return 'Generate text';
  if (/function|code/i.test(value)) return 'Execute function';
  return actionOperation(detail);
}

const processVerb = /^(?:validate|assign|send|notify|move|create|update|add|check|wait|log|search|find|upload|retrieve|approve|reject|archive|process|generate|close|continue|share|remove|export|mention|pause|retry)\b/i;
const splitActions = (text: string) => text
  .replace(/[.]+$/, '')
  .split(/\s+and\s+(?=(?:automatically\s+)?(?:validate|assign|send|notify|move|create|update|add|check|wait|log|search|find|upload|retrieve|approve|reject|archive|process|generate|close|continue|share|remove|export|mention|pause|retry)\b)/i)
  .map((item) => item.trim().replace(/^automatically\s+/i, '')).filter(Boolean);

function extractProceduralArchitecture(scope: string): { nodes: WorkflowNode[]; connections: WorkflowConnection[]; branches: WorkflowBranch[] } {
  const statements = scope.split(/\r?\n|(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const nodes: WorkflowNode[] = []; const connections: WorkflowConnection[] = []; const branches: WorkflowBranch[] = [];
  let tails: WorkflowNode[] = [];
  let openDecision: WorkflowNode | null = null;
  let openDecisionTails = new Map<'TRUE' | 'FALSE', WorkflowNode[]>();

  const append = (node: WorkflowNode) => {
    for (const tail of tails) connections.push(connect(tail.id, node.id));
    nodes.push(node); tails = [node];
    return node;
  };
  const appendActions = (text: string, starts: WorkflowNode[], branchLabel?: 'TRUE' | 'FALSE', condition?: string) => {
    let current = starts;
    for (const action of splitActions(text)) {
      if (!processVerb.test(action)) continue;
      const node = makeNode(actionCategory(action), actionTitle(action), actionService(action, ''), actionOperation(action), action);
      nodes.push(node);
      for (const source of current) connections.push(connect(source.id, node.id, branchLabel ?? '', branchLabel ?? null, condition ?? null));
      current = [node]; branchLabel = undefined; condition = undefined;
    }
    return current;
  };
  const createDecision = (question: string) => {
    const decision = makeNode('condition', conditionTitle(question), null, 'Evaluate condition', question);
    decision.decisionRule = { decisionQuestion: conditionTitle(question), field: conditionField(question), operator: 'equals', comparisonValue: true, trueLabel: 'TRUE', falseLabel: 'FALSE' };
    append(decision); openDecision = decision; openDecisionTails = new Map();
    return decision;
  };
  const addBranch = (label: 'TRUE' | 'FALSE', condition: string, actions: string) => {
    if (!openDecision) return;
    const branchTails = appendActions(actions, [openDecision], label, condition);
    if (!branchTails.length) return;
    openDecisionTails.set(label, branchTails);
    branches.push({ id: crypto.randomUUID(), sourceNodeId: openDecision.id, name: label, condition: { combinator: 'and', rules: [{ field: conditionField(openDecision.description), operator: 'equals', value: label === 'TRUE' }] }, destinationNodeId: branchTails[0]!.id, isDefault: label === 'FALSE' });
  };
  const closeDecision = () => {
    if (openDecisionTails.size) tails = [...openDecisionTails.values()].flat();
    openDecision = null; openDecisionTails = new Map();
  };

  for (const statement of statements) {
    const trigger = statement.match(/^(?:when|whenever|upon)\s+(.+?)(?:[,.]|$)/i);
    if (trigger && !nodes.length) {
      const detail = trigger[1]!.trim(); const service = findService(detail);
      append(makeNode('trigger', triggerTitle(detail, service), service, triggerOperation(detail), statement));
      const remainder = statement.slice(trigger[0].length).trim();
      if (remainder) tails = appendActions(remainder, tails);
      continue;
    }
    if (trigger) {
      const remainder = statement.slice(trigger[0].length).trim();
      if (remainder) tails = appendActions(remainder, tails);
      continue;
    }
    const route = statement.match(/^route\s+(.+?)\s+(?:by|based on)\s+(.+?)\s+to\s+(.+)$/i);
    if (route) {
      closeDecision();
      const routeField = route[2]!.trim();
      const destinations = route[3]!.replace(/[.]+$/, '').split(/\s*,\s*|\s+or\s+/i).map((item) => item.trim().replace(/^(?:or|and)\s+/i, '')).filter(Boolean);
      if (destinations.length > 2) {
        const router = append(makeNode('router', `Route by ${routeField}`, null, 'Route records', statement));
        const routeTails: WorkflowNode[] = [];
        for (const destination of destinations) {
          const action = makeNode('action', `Handle ${destination} route`, null, 'Perform routed action', `${route[1]!.trim()} where ${routeField} is ${destination}.`);
          nodes.push(action);
          connections.push({ ...connect(router.id, action.id), label: destination.toUpperCase(), routeType: 'conditional', style: 'conditional' });
          branches.push({ id: crypto.randomUUID(), sourceNodeId: router.id, name: destination, condition: { combinator: 'and', rules: [{ field: routeField, operator: 'equals', value: destination }] }, destinationNodeId: action.id, isDefault: false });
          routeTails.push(action);
        }
        const fallback = makeNode('action', 'Handle unmatched route', null, 'Review unmatched route', `Handle a ${routeField} value that does not match a named route.`);
        nodes.push(fallback);
        connections.push(connect(router.id, fallback.id, 'DEFAULT', 'DEFAULT'));
        branches.push({ id: crypto.randomUUID(), sourceNodeId: router.id, name: 'DEFAULT', condition: { combinator: 'and', rules: [{ field: routeField, operator: 'not_exists', value: null }] }, destinationNodeId: fallback.id, isDefault: true });
        const merge = makeNode('merge', `Merge ${routeField} routes`, null, 'Merge routes', `Rejoin all ${routeField} routes before continuing.`);
        nodes.push(merge);
        for (const tail of [...routeTails, fallback]) connections.push(connect(tail.id, merge.id));
        tails = [merge];
        continue;
      }
    }
    const timed = statement.match(/^after\s+([^,]+),\s*(.+)$/i);
    if (timed) {
      closeDecision();
      const duration = timed[1]!.trim();
      append(makeNode('delay', `Wait ${duration}`, null, 'Wait', `Wait ${duration} before continuing.`));
      const next = timed[2]!.trim();
      const whether = next.match(/^(?:check|determine)\s+whether\s+(.+)$/i);
      if (whether) createDecision(whether[1]!);
      else tails = appendActions(next, tails);
      continue;
    }
    const conditional = statement.match(/^if\s+(.+?),\s*(.+)$/i);
    if (conditional) {
      const condition = conditional[1]!.trim(); const actions = conditional[2]!.trim();
      if (!openDecision || openDecisionTails.has(conditionPolarity(condition))) {
        closeDecision();
        createDecision(conditionQuestion(condition, nodes.at(-1)));
      }
      addBranch(conditionPolarity(condition), condition, actions);
      continue;
    }
    closeDecision();
    if (processVerb.test(statement)) tails = appendActions(statement, tails);
  }
  if (openDecision) {
    if (!openDecisionTails.has('TRUE')) addTerminalBranch(openDecision, 'TRUE', 'Condition is satisfied.', nodes, connections, branches);
    if (!openDecisionTails.has('FALSE')) addTerminalBranch(openDecision, 'FALSE', 'Condition is not satisfied.', nodes, connections, branches);
    const existing = [...openDecisionTails.values()].flat();
    const terminals = nodes.filter((node) => node.category === 'end' && connections.some((edge) => edge.sourceNodeId === openDecision!.id && edge.targetNodeId === node.id));
    const end = makeNode('end', 'Workflow complete', null, 'End workflow', 'End after the response outcome is handled.');
    nodes.push(end);
    for (const tail of existing) connections.push(connect(tail.id, end.id));
    for (const terminal of terminals) tails.push(terminal);
  }
  return { nodes, connections, branches };
}

function addEvidenceBasedIterators(
  architecture: { nodes: WorkflowNode[]; connections: WorkflowConnection[]; branches: WorkflowBranch[] },
  platform: AnalysisProviderInput['platform'],
) {
  const nodes = [...architecture.nodes];
  let connections = [...architecture.connections];
  const branches = architecture.branches.map((branch) => ({ ...branch }));
  const candidates = nodes.filter((node) =>
    !['trigger', 'condition', 'router', 'loop', 'merge', 'end'].includes(node.category)
    && /\b(?:for each|each (?:task|record|item|attachment|recipient|post|file)|every (?:task|record|item|attachment|recipient|post|file))\b/i.test(node.description),
  );

  for (const item of candidates) {
    const incoming = connections.filter((connection) => connection.targetNodeId === item.id && connection.routeType !== 'error');
    if (incoming.length !== 1) continue;
    const outgoing = connections.filter((connection) => connection.sourceNodeId === item.id && connection.routeType !== 'error');
    const presentation = collectionIteratorPresentation(platform, item.description);
    const iterator = makeNode('loop', `${presentation.label} — ${item.name}`, presentation.service, presentation.operation, `Process each collection item for: ${item.description}`);
    nodes.push(iterator);
    connections = connections.map((connection) => {
      if (connection.id === incoming[0]!.id) return { ...connection, targetNodeId: iterator.id };
      if (outgoing.some((candidate) => candidate.id === connection.id)) return { ...connection, sourceNodeId: iterator.id, label: 'DONE', branchLabel: 'DONE', routeType: 'success', style: 'success' };
      return connection;
    });
    connections.push(connect(iterator.id, item.id, 'LOOP', 'LOOP'));
    connections.push(connect(item.id, iterator.id, 'LOOP', 'LOOP'));
    if (!outgoing.length) {
      const end = makeNode('end', `${item.name} — Completed`, null, 'Complete workflow', 'All collection items have been processed.');
      nodes.push(end);
      connections.push(connect(iterator.id, end.id, 'DONE', 'DONE'));
    }
    for (const branch of branches) if (branch.destinationNodeId === item.id) branch.destinationNodeId = iterator.id;
  }

  return { nodes, connections, branches };
}

function collectionIteratorPresentation(platform: AnalysisProviderInput['platform'], evidence: string) {
  if (platform === 'make') return { label: 'Iterator', service: 'Make Flow Control', operation: 'Iterator' };
  if (platform === 'zapier') return { label: 'Looping by Zapier', service: 'Looping by Zapier', operation: 'Create Loop From Line Items' };
  if (/\b(?:batch|batches|batch size|one at a time)\b/i.test(evidence)) {
    return { label: 'Loop Over Items', service: 'n8n', operation: 'Loop Over Items' };
  }
  return { label: 'Split Out', service: 'n8n', operation: 'Split Out' };
}

function addTerminalBranch(decision: WorkflowNode, label: 'TRUE' | 'FALSE', condition: string, nodes: WorkflowNode[], connections: WorkflowConnection[], branches: WorkflowBranch[]) {
  const end = makeNode('end', label === 'TRUE' ? 'Complete workflow' : 'Stop workflow', null, 'End workflow', condition);
  nodes.push(end);
  connections.push(connect(decision.id, end.id, label, label, condition));
  branches.push({ id: crypto.randomUUID(), sourceNodeId: decision.id, name: label, condition: { combinator: 'and', rules: [{ field: conditionField(decision.description), operator: 'equals', value: label === 'TRUE' }] }, destinationNodeId: end.id, isDefault: label === 'FALSE' });
}

function conditionPolarity(text: string): 'TRUE' | 'FALSE' {
  return /\b(?:invalid|no\b|not\b|false|failed|failure|rejected|declined|without)\b/i.test(text) ? 'FALSE' : 'TRUE';
}
function conditionQuestion(text: string, previous: WorkflowNode | undefined): string {
  if (/^valid$/i.test(text) && previous) return `Is the ${previous.description.match(/\b(email|record|request|lead|data)\b/i)?.[1] ?? 'item'} valid?`;
  if (/^invalid$/i.test(text) && previous) return `Is the ${previous.description.match(/\b(email|record|request|lead|data)\b/i)?.[1] ?? 'item'} valid?`;
  return text.replace(/^there is\s+/i, '').replace(/^the\s+/i, '');
}
function conditionTitle(text: string): string {
  const cleaned = text.replace(/[?.]+$/, '').trim();
  if (/\brepl(?:y|ied)\b|\brespond/i.test(cleaned)) return 'Has the lead replied?';
  if (/\bvalid\b/i.test(cleaned)) return 'Is the email valid?';
  return `Is ${cleaned}?`;
}
function conditionField(text: string): string {
  if (/email.*valid|valid.*email/i.test(text)) return 'emailValid';
  if (/repl(?:y|ied)|respond/i.test(text)) return 'leadReplied';
  return 'conditionResult';
}

function findService(text: string): string | null { return serviceNames.find((service) => text.toLowerCase().includes(service.toLowerCase())) ?? null; }
function actionService(text: string, section: string): string | null {
  const explicit = findService(text); if (explicit) return explicit;
  if (/folder|drive link|upload file/i.test(text)) return 'Google Drive';
  if (/subtask|\btask\b|asana/i.test(`${text} ${section}`)) return 'Asana';
  if (/(?:send|forward|reply).*\bemail\b|\bemail\b.*(?:send|forward|reply)/i.test(text)) return 'Email provider';
  if (/text message|\bsms\b/i.test(text)) return 'Messaging provider';
  return null;
}
function actionCategory(text: string): WorkflowNode['category'] { return /validate|verify|check whether/i.test(text) ? 'action' : /email/i.test(text) ? 'email' : /text message|\bsms\b/i.test(text) ? 'messaging' : /notify/i.test(text) ? 'notification' : /wait|once a week|after \d/i.test(text) ? 'delay' : /^(?:if|whether)\b|responded\?/i.test(text) ? 'condition' : /sheet|database|record/i.test(text) ? 'database' : 'action'; }
function actionTitle(text: string): string {
  if (/create a folder/i.test(text)) return 'Create lead folder in Google Drive';
  if (/create a subtask/i.test(text)) return 'Create Social Media Content subtask in Asana';
  if (/include a link/i.test(text)) return 'Add Google Drive folder link to Asana subtask';
  if (/welcome email/i.test(text)) return 'Send personalized welcome email with PDF';
  if (/recommendation email/i.test(text)) return 'Send service recommendation email';
  if (/quote/i.test(text) && /follow up|follow-up/i.test(text)) return 'Send weekly quote follow-up';
  if (/follow-up|follow up/i.test(text)) return 'Send lead follow-up message';
  return sentenceTitle(text);
}
function actionOperation(text: string): string { return /validate|verify/i.test(text) ? 'Validate data' : /folder/i.test(text) ? 'Create folder' : /subtask/i.test(text) ? 'Create subtask' : /email/i.test(text) ? 'Send email' : /text message|sms/i.test(text) ? 'Send message' : /link/i.test(text) ? 'Update task description' : /generate/i.test(text) ? 'Generate document' : /retry/i.test(text) ? 'Retry operation' : /create/i.test(text) ? 'Create record' : /update/i.test(text) ? 'Update record' : 'Perform action'; }
function triggerTitle(text: string, service: string | null): string { const column = text.match(/["“']([^"”']+)["”']/)?.[1]; return column ? `${service || 'Lead'} — ${column} status reached` : sentenceTitle(text.replace(/^when\s+/i, '')); }
function triggerOperation(text: string): string { return /column|status/i.test(text) ? 'Task status changed' : /schedule|every|weekly/i.test(text) ? 'Scheduled event' : 'Receive event'; }
function sentenceTitle(text: string): string { const cleaned = text.replace(/^automatically\s+/i, '').replace(/[.]+$/, '').trim(); return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`.slice(0, 120); }
function summarize(scope: string): string { return scope.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !boilerplate.test(line) && !/^scope of work/i.test(line))?.slice(0, 500) ?? 'Automation workflow extracted from the supplied requirements.'; }
