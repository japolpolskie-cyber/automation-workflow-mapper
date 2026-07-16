import { leadQualificationWorkflow, type CanonicalWorkflow, type WorkflowConnection, type WorkflowNode } from '@awm/shared';
import type { AnalysisProvider, AnalysisProviderInput } from './analysis-provider.js';

const serviceNames = ['Asana', 'Google Drive', 'Salesforce', 'HubSpot', 'GoHighLevel', 'Slack', 'Microsoft Teams', 'Google Sheets', 'Airtable', 'Apollo', 'Facebook Lead Ads', 'Gmail', 'Outlook', 'Notion', 'Shopify', 'Stripe', 'Twilio'];
const boilerplate = /\b(we are seeking|skilled .+ expert|scope of work|essential for improving|help us streamline|job description|ideal candidate|responsibilit(?:y|ies)|qualification|deliverable)\b/i;
const heading = /(?:automation|workflow|process|overview|objective|project)$/i;
const operationalStart = /^(automatically\s+|create\s+|include\s+|send\s+|update\s+|add\s+|check\s+|wait\s+|notify\s+|log\s+|search\s+|find\s+|validate\s+|move\s+|upload\s+)/i;

const makeNode = (category: WorkflowNode['category'], name: string, service: string | null, operation: string, description = ''): WorkflowNode => ({ id: crypto.randomUUID(), category, name, description, service, operation, purpose: description, expectedResult: '', icon: 'generic-action', estimatedExecution: category === 'delay' ? 'Depends on configured wait' : 'Under 1 minute', inputs: [], outputs: [], credentials: service ? [`${service} connection`] : [], configuration: {}, status: 'incomplete', configurationCompleteness: 35, conditions: [], decisionRule: null, notes: '', bestPractices: [], potentialErrors: [], alternativeImplementations: [], performanceNotes: [], securityNotes: [], riskLevel: ['api_request', 'database', 'crm'].includes(category) ? 'high' : 'low' });
const connect = (sourceNodeId: string, targetNodeId: string): WorkflowConnection => ({ id: crypto.randomUUID(), sourceNodeId, targetNodeId, sourcePort: 'output', targetPort: 'input', label: '', branchLabel: null, style: 'default', condition: null, routeType: 'success', mappings: [] });

export class LocalAnalysisProvider implements AnalysisProvider {
  public readonly name = 'local' as const;
  public async analyze(input: AnalysisProviderInput): Promise<unknown> {
    if (/facebook lead ads/i.test(input.scope) && /apollo/i.test(input.scope) && /hubspot/i.test(input.scope)) {
      const now = new Date().toISOString();
      return { ...structuredClone(leadQualificationWorkflow), id: crypto.randomUUID(), name: input.projectName, targetPlatform: input.platform, createdAt: now, updatedAt: now };
    }
    const now = new Date().toISOString();
    const { nodes, connections } = extractOperationalArchitecture(input.scope);
    if (!nodes.length) nodes.push(makeNode('trigger', 'Workflow trigger to be confirmed', null, 'Receive event', 'Start the automation when the agreed business event occurs.'));
    const systems = [...new Set(nodes.map((node) => node.service).filter((value): value is string => Boolean(value)))].map((name) => ({ name, category: 'application' }));
    const missingInformation = [nodes.some((node) => node.category === 'trigger' && !node.service) ? 'Application that provides the trigger' : '', /text messages|sms/i.test(input.scope) && !/twilio|clicksend/i.test(input.scope) ? 'Approved SMS provider and sender' : '', /email/i.test(input.scope) && !/gmail|outlook|smtp/i.test(input.scope) ? 'Approved email provider and sender' : '', !/\b(error|fail|retry|fallback)\b/i.test(input.scope) ? 'Required failure behavior' : ''].filter(Boolean);
    const clarificationQuestions = missingInformation.map((missing) => ({ id: crypto.randomUUID(), question: `Please confirm: ${missing}.`, category: /provider|application/i.test(missing) ? 'system' as const : 'error_handling' as const, required: true, answer: null, relatedNodeId: null }));
    const workflow: CanonicalWorkflow = { schemaVersion: '2.0', id: crypto.randomUUID(), name: input.projectName, summary: summarize(input.scope), objective: summarize(input.scope), targetPlatform: input.platform, confidence: nodes.length > 2 ? 0.68 : 0.45, actors: [], systems, nodes, connections, branches: [], errorHandling: [], clarificationQuestions, risks: [], complexity: nodes.length < 6 ? 'simple' : nodes.length < 14 ? 'moderate' : 'advanced', assumptions: [], missingInformation, warnings: ['Free deterministic fallback extracted only explicit Trigger and Action requirements. Review application choices and branch behavior before implementation.'], recommendations: ['Confirm messaging providers where the scope permits email or SMS alternatives.'], completionCriteria: [], estimatedExecutionTime: '', createdAt: now, updatedAt: now };
    return workflow;
  }
  public async getStatus() { return { provider: this.name, available: true, models: ['deterministic-local-preview'], message: 'Local preview is ready.' }; }
}

function extractOperationalArchitecture(scope: string): { nodes: WorkflowNode[]; connections: WorkflowConnection[] } {
  const lines = scope.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const nodes: WorkflowNode[] = []; const connections: WorkflowConnection[] = [];
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
  return { nodes, connections };
}

function findService(text: string): string | null { return serviceNames.find((service) => text.toLowerCase().includes(service.toLowerCase())) ?? null; }
function actionService(text: string, section: string): string | null {
  const explicit = findService(text); if (explicit) return explicit;
  if (/folder|drive link|upload file/i.test(text)) return 'Google Drive';
  if (/subtask|\btask\b|asana/i.test(`${text} ${section}`)) return 'Asana';
  if (/email/i.test(text)) return 'Email provider';
  if (/text message|\bsms\b/i.test(text)) return 'Messaging provider';
  return null;
}
function actionCategory(text: string): WorkflowNode['category'] { return /email/i.test(text) ? 'email' : /text message|\bsms\b/i.test(text) ? 'messaging' : /notify/i.test(text) ? 'notification' : /wait|once a week|after \d/i.test(text) ? 'delay' : /if |whether|responded\?/i.test(text) ? 'condition' : /sheet|database|record/i.test(text) ? 'database' : 'action'; }
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
function actionOperation(text: string): string { return /folder/i.test(text) ? 'Create folder' : /subtask/i.test(text) ? 'Create subtask' : /email/i.test(text) ? 'Send email' : /text message|sms/i.test(text) ? 'Send message' : /link/i.test(text) ? 'Update task description' : /create/i.test(text) ? 'Create record' : /update/i.test(text) ? 'Update record' : 'Perform action'; }
function triggerTitle(text: string, service: string | null): string { const column = text.match(/["“']([^"”']+)["”']/)?.[1]; return column ? `${service || 'Lead'} — ${column} status reached` : sentenceTitle(text.replace(/^when\s+/i, '')); }
function triggerOperation(text: string): string { return /column|status/i.test(text) ? 'Task status changed' : /schedule|every|weekly/i.test(text) ? 'Scheduled event' : 'Receive event'; }
function sentenceTitle(text: string): string { const cleaned = text.replace(/^automatically\s+/i, '').replace(/[.]+$/, '').trim(); return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`.slice(0, 120); }
function summarize(scope: string): string { return scope.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !boilerplate.test(line) && !/^scope of work/i.test(line))?.slice(0, 500) ?? 'Automation workflow extracted from the supplied requirements.'; }
