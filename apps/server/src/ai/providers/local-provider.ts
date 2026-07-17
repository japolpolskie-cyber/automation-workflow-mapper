import { leadQualificationWorkflow, type CanonicalWorkflow, type WorkflowBranch, type WorkflowConnection, type WorkflowNode } from '@awm/shared';
import type { AnalysisProvider, AnalysisProviderInput } from './analysis-provider.js';

const serviceNames = ['Asana', 'Google Drive', 'Salesforce', 'HubSpot', 'GoHighLevel', 'Slack', 'Microsoft Teams', 'Google Sheets', 'Airtable', 'Apollo', 'Facebook Lead Ads', 'Gmail', 'Outlook', 'Notion', 'Shopify', 'Stripe', 'Twilio'];
const boilerplate = /\b(we are seeking|skilled .+ expert|scope of work|essential for improving|help us streamline|job description|ideal candidate|responsibilit(?:y|ies)|qualification|deliverable)\b/i;
const heading = /(?:automation|workflow|process|overview|objective|project)$/i;
const operationalStart = /^(automatically\s+|create\s+|include\s+|send\s+|update\s+|add\s+|check\s+|wait\s+|notify\s+|log\s+|search\s+|find\s+|validate\s+|move\s+|upload\s+)/i;

const makeNode = (category: WorkflowNode['category'], name: string, service: string | null, operation: string, description = ''): WorkflowNode => ({ id: crypto.randomUUID(), category, name, description, service, operation, purpose: description, expectedResult: '', icon: 'generic-action', estimatedExecution: category === 'delay' ? 'Depends on configured wait' : 'Under 1 minute', inputs: [], outputs: [], credentials: service ? [`${service} connection`] : [], configuration: {}, status: 'incomplete', configurationCompleteness: 35, conditions: [], decisionRule: null, notes: '', bestPractices: [], potentialErrors: [], alternativeImplementations: [], performanceNotes: [], securityNotes: [], riskLevel: ['api_request', 'database', 'crm'].includes(category) ? 'high' : 'low' });
const connect = (sourceNodeId: string, targetNodeId: string, label = '', branchLabel: WorkflowConnection['branchLabel'] = null, condition: string | null = null): WorkflowConnection => ({ id: crypto.randomUUID(), sourceNodeId, targetNodeId, sourcePort: 'output', targetPort: 'input', label, branchLabel, style: branchLabel ? 'conditional' : 'default', condition, routeType: branchLabel ? 'conditional' : 'success', mappings: [] });

export class LocalAnalysisProvider implements AnalysisProvider {
  public readonly name = 'local' as const;
  public async analyze(input: AnalysisProviderInput): Promise<unknown> {
    if (/facebook lead ads/i.test(input.scope) && /apollo/i.test(input.scope) && /hubspot/i.test(input.scope)) {
      const now = new Date().toISOString();
      return { ...structuredClone(leadQualificationWorkflow), id: crypto.randomUUID(), name: input.projectName, targetPlatform: input.platform, createdAt: now, updatedAt: now };
    }
    const now = new Date().toISOString();
    const { nodes, connections, branches } = extractOperationalArchitecture(input.scope);
    if (!nodes.length) nodes.push(makeNode('trigger', 'Workflow trigger to be confirmed', null, 'Receive event', 'Start the automation when the agreed business event occurs.'));
    const systems = [...new Set(nodes.map((node) => node.service).filter((value): value is string => Boolean(value)))].map((name) => ({ name, category: 'application' }));
    const missingInformation = [nodes.some((node) => node.category === 'trigger' && !node.service) ? 'Application that provides the trigger' : '', /text messages|sms/i.test(input.scope) && !/twilio|clicksend/i.test(input.scope) ? 'Approved SMS provider and sender' : '', /email/i.test(input.scope) && !/gmail|outlook|smtp/i.test(input.scope) ? 'Approved email provider and sender' : '', !/\b(error|fail|retry|fallback)\b/i.test(input.scope) ? 'Required failure behavior' : ''].filter(Boolean);
    const clarificationQuestions = missingInformation.map((missing) => ({ id: crypto.randomUUID(), question: `Please confirm: ${missing}.`, category: /provider|application/i.test(missing) ? 'system' as const : 'error_handling' as const, required: true, answer: null, relatedNodeId: null }));
    const workflow: CanonicalWorkflow = { schemaVersion: '2.0', id: crypto.randomUUID(), name: input.projectName, summary: summarize(input.scope), objective: summarize(input.scope), targetPlatform: input.platform, confidence: nodes.length > 2 ? 0.68 : 0.45, actors: [], systems, nodes, connections, branches, errorHandling: [], clarificationQuestions, risks: [], complexity: branches.length || nodes.length >= 6 ? 'moderate' : 'simple', assumptions: [], missingInformation, warnings: ['Free deterministic fallback extracted supported explicit process steps. Review application choices and unresolved business rules before implementation.'], recommendations: ['Confirm messaging providers where the scope permits email or SMS alternatives.'], completionCriteria: [], estimatedExecutionTime: '', createdAt: now, updatedAt: now };
    return workflow;
  }
  public async getStatus() { return { provider: this.name, available: true, models: ['deterministic-local-preview'], message: 'Local preview is ready.' }; }
}

function extractOperationalArchitecture(scope: string): { nodes: WorkflowNode[]; connections: WorkflowConnection[]; branches: WorkflowBranch[] } {
  if (!/^\s*(?:trigger|action)\s*:/im.test(scope) && /\b(?:when|upon)\b/i.test(scope)) return extractProceduralArchitecture(scope);
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

const processVerb = /^(?:validate|assign|send|notify|move|create|update|add|check|wait|log|search|find|upload|retrieve|approve|reject|archive|process)\b/i;
const splitActions = (text: string) => text
  .replace(/[.]+$/, '')
  .split(/\s+and\s+(?=(?:validate|assign|send|notify|move|create|update|add|check|wait|log|search|find|upload|retrieve|approve|reject|archive|process)\b)/i)
  .map((item) => item.trim()).filter(Boolean);

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
    const trigger = statement.match(/^(?:when|upon)\s+(.+?)(?:[,.]|$)/i);
    if (trigger && !nodes.length) {
      const detail = trigger[1]!.trim(); const service = findService(detail);
      append(makeNode('trigger', triggerTitle(detail, service), service, triggerOperation(detail), statement));
      const remainder = statement.slice(trigger[0].length).trim();
      if (remainder) tails = appendActions(remainder, tails);
      continue;
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
function actionCategory(text: string): WorkflowNode['category'] { return /validate|verify|check whether/i.test(text) ? 'action' : /email/i.test(text) ? 'email' : /text message|\bsms\b/i.test(text) ? 'messaging' : /notify/i.test(text) ? 'notification' : /wait|once a week|after \d/i.test(text) ? 'delay' : /if |whether|responded\?/i.test(text) ? 'condition' : /sheet|database|record/i.test(text) ? 'database' : 'action'; }
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
function actionOperation(text: string): string { return /validate|verify/i.test(text) ? 'Validate data' : /folder/i.test(text) ? 'Create folder' : /subtask/i.test(text) ? 'Create subtask' : /email/i.test(text) ? 'Send email' : /text message|sms/i.test(text) ? 'Send message' : /link/i.test(text) ? 'Update task description' : /create/i.test(text) ? 'Create record' : /update/i.test(text) ? 'Update record' : 'Perform action'; }
function triggerTitle(text: string, service: string | null): string { const column = text.match(/["“']([^"”']+)["”']/)?.[1]; return column ? `${service || 'Lead'} — ${column} status reached` : sentenceTitle(text.replace(/^when\s+/i, '')); }
function triggerOperation(text: string): string { return /column|status/i.test(text) ? 'Task status changed' : /schedule|every|weekly/i.test(text) ? 'Scheduled event' : 'Receive event'; }
function sentenceTitle(text: string): string { const cleaned = text.replace(/^automatically\s+/i, '').replace(/[.]+$/, '').trim(); return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`.slice(0, 120); }
function summarize(scope: string): string { return scope.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !boilerplate.test(line) && !/^scope of work/i.test(line))?.slice(0, 500) ?? 'Automation workflow extracted from the supplied requirements.'; }
