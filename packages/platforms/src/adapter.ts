import { resolveApplication, type CanonicalWorkflow, type Platform, type PlatformBuildPlan, type PlatformConnection, type PlatformNode, type PlatformNodeDefinition, type PlatformValidationIssue, type PlatformWorkflow, type WorkflowNode } from '@awm/shared';

const serviceEvents: Record<string, Record<string, string[]>> = {
  asana: { trigger: ['New Task', 'Updated Task', 'Task Custom Field Updated'], action: ['Create Subtask', 'Create Task', 'Update Task', 'Find Task'] },
  'google drive': { trigger: ['New File'], action: ['Create Folder', 'Upload File', 'Move File'] },
  gmail: { trigger: ['New Email'], action: ['Send Email', 'Create Draft'] },
  outlook: { trigger: ['New Email'], action: ['Send Email', 'Create Draft'] },
  twilio: { trigger: ['New SMS', 'New Call'], action: ['Send SMS', 'Send WhatsApp Message', 'Make Call'] },
  clicksend: { trigger: ['New Inbound SMS'], action: ['Send SMS', 'Send MMS'] },
  slack: { trigger: ['New Message'], action: ['Send Channel Message', 'Send Direct Message'] },
  hubspot: { trigger: ['New Contact', 'Contact Property Updated'], action: ['Create Contact', 'Update Contact', 'Create or Update Contact', 'Find Contact'] },
  airtable: { trigger: ['New Record', 'Updated Record'], action: ['Create Record', 'Update Record', 'Find Record'] },
  'google sheets': { trigger: ['New Spreadsheet Row'], action: ['Create Spreadsheet Row', 'Update Spreadsheet Row', 'Lookup Spreadsheet Row'] },
  shopify: { trigger: ['New Order', 'Updated Order'], action: ['Create Order', 'Update Order', 'Find Customer'] }
};

const eventInputs: Record<string, string[]> = {
  'Create Subtask': ['Parent task ID', 'Subtask name'],
  'Task: Create (set Parent Task)': ['Parent task ID', 'Subtask name'],
  'Create a Task (set Parent task)': ['Parent task ID', 'Subtask name'],
  'Create Task': ['Task name', 'Project or workspace'],
  'Create Folder': ['Folder name', 'Parent folder'],
  'Send Email': ['Recipient', 'Subject', 'Message body'],
  'Message: Send': ['Recipient email', 'Subject', 'Message body'],
  'Send an Email': ['Recipient email', 'Subject', 'Message body'],
  'Send SMS': ['Recipient phone number', 'Sender', 'Message body'],
  'Send Message': ['Recipient or channel', 'Message body']
};

const categoryAliases: Partial<Record<WorkflowNode['category'], string>> = { condition: 'filter', webhook: 'api_request', ai: 'action', database: 'action', crm: 'action', spreadsheet: 'action', email: 'notification', messaging: 'notification', retry: 'error_handler', merge: 'router', split: 'router', start: 'trigger', end: 'logger', note: 'logger', group: 'sub_workflow' };
const words = (value: string | null | undefined) => (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const inferService = (node: WorkflowNode): string | null => {
  if (node.service?.trim()) return node.service.trim();
  const context = `${node.name} ${node.description} ${node.notes}`.toLowerCase();
  const service = Object.keys(serviceEvents).find((candidate) => context.includes(candidate));
  if (service) return service.split(' ').map((part) => part[0]!.toUpperCase() + part.slice(1)).join(' ');
  const resolved = resolveApplication(node);
  return resolved.id === 'internal' ? null : resolved.name;
};
const stepTypeFor = (platform: Platform, definition: PlatformNodeDefinition, appName: string) => {
  if (appName === definition.appName) return definition.label;
  if (platform === 'n8n') return `${appName} node`;
  if (platform === 'make') return `${appName} action module`;
  return `${appName} action`;
};
const platformEventFor = (platform: Platform, appName: string, event: string) => {
  if (appName.toLowerCase() === 'asana' && event === 'Create Subtask') {
    if (platform === 'n8n') return 'Task: Create (set Parent Task)';
    if (platform === 'make') return 'Create a Task (set Parent task)';
  }
  if (['gmail', 'outlook'].includes(appName.toLowerCase()) && event === 'Send Email') return platform === 'n8n' ? 'Message: Send' : platform === 'make' ? 'Send an Email' : 'Send Email';
  return event;
};
const credentialFor = (appName: string, platform: Platform) => {
  const app = appName.toLowerCase();
  if (app === 'gmail') return platform === 'n8n' ? 'Gmail OAuth2 credential' : 'Gmail OAuth connection';
  if (app === 'outlook') return 'Microsoft Outlook OAuth connection';
  if (['twilio', 'clicksend'].includes(app)) return `${appName} API credential`;
  return null;
};
const buildInstructions = (node: WorkflowNode, appName: string, event: string, credential: string | null) => {
  const steps: string[] = [];
  if (credential) steps.push(`Connect or create the ${credential}.`);
  if (/send.*email|message: send/i.test(event)) steps.push('Map the lead email address into the recipient field.', 'Set the subject and follow-up message body or template.', 'Add an optional reply-to address and attachments if required.', 'Test with a safe internal email address before enabling the workflow.');
  else if (/send (sms|mms)|whatsapp/i.test(event)) steps.push('Map and validate the recipient phone number in international format.', 'Select the approved sender number or messaging service.', 'Set the message body and confirm consent/opt-out handling.', 'Test with a permitted destination number before enabling the workflow.');
  else steps.push(`Configure the required fields for ${event}.`, 'Map data from the previous node into each required field.', 'Run a test with representative sample data.');
  if (node.retryPolicy) steps.push(`Configure ${node.retryPolicy.attempts} retry attempt${node.retryPolicy.attempts === 1 ? '' : 's'} with ${node.retryPolicy.backoff} backoff.`);
  return steps;
};
const messagingAlternatives = (node: WorkflowNode, appName: string) => {
  if (!/follow.?up|message|email|sms|text/i.test(`${node.name} ${node.description}`)) return [];
  if (['gmail', 'outlook'].includes(appName.toLowerCase())) return ['Microsoft Outlook — Send Email', 'Transactional email provider — Send template email', 'Twilio or ClickSend — Send SMS (only if SMS is required)'];
  if (['twilio', 'clicksend'].includes(appName.toLowerCase())) return ['Gmail or Outlook — Send Email', 'Another approved SMS provider'];
  return ['Gmail — Send Email', 'Microsoft Outlook — Send Email', 'Twilio — Send SMS', 'ClickSend — Send SMS'];
};
const chooseEvent = (node: WorkflowNode, definition: PlatformNodeDefinition): string => {
  const custom = serviceEvents[(node.service ?? '').toLowerCase()]?.[node.category === 'trigger' || node.category === 'start' ? 'trigger' : 'action'];
  const choices = custom?.length ? custom : definition.events;
  const operationWords = words(node.operation ?? node.name);
  return choices.find((event) => words(event).some((word) => operationWords.includes(word))) ?? choices[0] ?? node.operation ?? 'Configure event';
};

export class CatalogPlatformAdapter {
  public constructor(public readonly platform: Platform, public readonly displayName: string, private readonly catalog: readonly PlatformNodeDefinition[], private readonly architecture: string[]) {}
  public getNodeCatalog() { return this.catalog; }
  public transform(workflow: CanonicalWorkflow): PlatformWorkflow<PlatformNode, PlatformConnection> {
    const nodes = workflow.nodes.map((node, index) => {
      const inferredService = inferService(node);
      const externalRequest = !inferredService && /webhook|api request|external website|custom endpoint/i.test(`${node.name} ${node.description}`);
      const category = externalRequest ? 'api_request' : categoryAliases[node.category] ?? node.category;
      const definition = this.catalog.find((item) => item.category === category) ?? this.catalog.find((item) => item.category === 'action')!;
      const appName = inferredService || definition.appName;
      const event = platformEventFor(this.platform, appName, chooseEvent({ ...node, service: inferredService }, definition));
      const specificCredential = credentialFor(appName, this.platform);
      const requiredCredentials = node.credentials.length ? node.credentials : specificCredential ? [specificCredential] : definition.credentialType ? [`${appName}: ${definition.credentialType}`] : [];
      const suggestedInputs = [...definition.requiredInputs, ...(eventInputs[event] ?? [])];
      const nativeConnectorNote = inferredService ? `Prefer the native ${appName} connector. Use HTTP or webhook only when the native connector does not support this operation.` : '';
      const alternatives = messagingAlternatives(node, appName);
      const decisionsRequired = !inferredService && alternatives.length ? ['Choose whether this follow-up is email, SMS, or both.', 'Choose the approved messaging provider and sender identity.'] : [];
      return { id: `${this.platform}-${node.id}`, sourceNodeId: node.id, stepNumber: index + 1, type: definition.type, stepType: stepTypeFor(this.platform, definition, appName), appName, event, resource: node.configuration.resource as string ?? null, inputFields: node.inputs.map((field) => field.label).concat(suggestedInputs.filter((field) => !node.inputs.some((input) => input.label.toLowerCase() === field.toLowerCase()))), outputFields: node.outputs.map((field) => field.label).concat(definition.expectedOutputs), mappingNotes: workflow.connections.filter((connection) => connection.targetNodeId === node.id).flatMap((connection) => connection.mappings.map((mapping) => `${mapping.sourceField} → ${mapping.destinationField}${mapping.transformation ? ` (${mapping.transformation})` : ''}`)), configurationNotes: [nativeConnectorNote, node.description, node.notes].filter(Boolean), requiredCredentials, limitations: definition.limitations, implementationSteps: buildInstructions(node, appName, event, specificCredential ?? requiredCredentials[0] ?? null), alternatives, decisionsRequired } satisfies PlatformNode;
    });
    return { platform: this.platform, sourceWorkflowId: workflow.id, nodes, connections: workflow.connections.map((connection) => ({ id: connection.id, sourceNodeId: `${this.platform}-${connection.sourceNodeId}`, targetNodeId: `${this.platform}-${connection.targetNodeId}`, label: connection.label, condition: connection.condition, mappings: connection.mappings.map((mapping) => ({ sourceField: mapping.sourceField, destinationField: mapping.destinationField, transformation: mapping.transformation })) })), warnings: [] };
  }
  public validate(workflow: PlatformWorkflow<PlatformNode, PlatformConnection>): PlatformValidationIssue[] {
    const issues: PlatformValidationIssue[] = [];
    if (!workflow.nodes.some((node) => node.stepType.toLowerCase().includes('trigger'))) issues.push({ severity: 'error', code: 'TRIGGER_REQUIRED', message: `${this.displayName} workflow needs a trigger.` });
    for (const node of workflow.nodes) {
      if (node.event === 'Configure event') issues.push({ severity: 'warning', code: 'EVENT_REQUIRED', message: `Choose an event for ${node.appName}.`, nodeId: node.sourceNodeId });
      if (!node.inputFields.length && !node.stepType.toLowerCase().includes('trigger')) issues.push({ severity: 'recommendation', code: 'INPUT_MAPPING_RECOMMENDED', message: `Confirm input fields for ${node.event}.`, nodeId: node.sourceNodeId });
    }
    if (this.platform === 'zapier' && workflow.nodes.length > 12) issues.push({ severity: 'recommendation', code: 'SPLIT_ZAP', message: 'Consider splitting this workflow into multiple Zaps or Sub-Zaps.' });
    return issues;
  }
  public estimateUsage(workflow: PlatformWorkflow<PlatformNode, PlatformConnection>): 'low' | 'medium' | 'high' { return workflow.nodes.length > 12 || workflow.nodes.some((node) => node.type === 'looping' || node.type === 'iterator' || node.type === 'loop') ? 'high' : workflow.nodes.length > 6 ? 'medium' : 'low'; }
  public buildPlan(workflow: CanonicalWorkflow): PlatformBuildPlan { const transformed = this.transform(workflow); return { ...transformed, platformName: this.displayName, workflowName: workflow.name, architectureNotes: this.architecture, usageEstimate: this.estimateUsage(transformed), validationIssues: this.validate(transformed) }; }
}
