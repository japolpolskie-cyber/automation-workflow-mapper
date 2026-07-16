import type { WorkflowNode } from './domain.js';

export interface ApplicationDefinition {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  icon: string;
  external: boolean;
  operations: string[];
}

const application = (id: string, name: string, category: string, icon: string, operations: string[], aliases: string[] = []): ApplicationDefinition => ({ id, name, aliases, category, icon, external: true, operations });

export const applicationRegistry: readonly ApplicationDefinition[] = [
  application('facebook-lead-ads', 'Facebook Lead Ads', 'lead-source', 'facebook', ['New Lead'], ['facebook leads']),
  application('instagram', 'Instagram', 'social', 'instagram', ['New Message', 'Publish Content']),
  application('messenger', 'Messenger', 'messaging', 'messenger', ['New Message', 'Send Message']),
  application('slack', 'Slack', 'messaging', 'slack', ['New Message', 'Send Channel Message', 'Send Direct Message']),
  application('discord', 'Discord', 'messaging', 'discord', ['New Message', 'Send Message']),
  application('hubspot', 'HubSpot', 'crm', 'hubspot', ['Find Contact', 'Create Contact', 'Update Contact', 'Create or Update Contact']),
  application('gohighlevel', 'GoHighLevel', 'crm', 'gohighlevel', ['Find Contact', 'Create Contact', 'Update Contact', 'Create Opportunity'], ['highlevel']),
  application('salesforce', 'Salesforce', 'crm', 'salesforce', ['Find Record', 'Create Record', 'Update Record', 'Upsert Record']),
  application('google-sheets', 'Google Sheets', 'spreadsheet', 'google-sheets', ['Lookup Row', 'Create Row', 'Update Row']),
  application('airtable', 'Airtable', 'database', 'airtable', ['Find Record', 'Create Record', 'Update Record']),
  application('notion', 'Notion', 'database', 'notion', ['Find Page', 'Create Page', 'Update Page']),
  application('clickup', 'ClickUp', 'project-management', 'clickup', ['Find Task', 'Create Task', 'Update Task']),
  application('asana', 'Asana', 'project-management', 'asana', ['Find Task', 'Create Task', 'Create Subtask', 'Update Task']),
  application('openai', 'OpenAI', 'ai', 'openai', ['Generate Text', 'Analyze Text', 'Classify']),
  application('gemini', 'Gemini', 'ai', 'gemini', ['Generate Text', 'Analyze Text', 'Classify']),
  application('google-drive', 'Google Drive', 'storage', 'google-drive', ['Find File', 'Create Folder', 'Upload File', 'Move File']),
  application('dropbox', 'Dropbox', 'storage', 'dropbox', ['Find File', 'Create Folder', 'Upload File']),
  application('stripe', 'Stripe', 'payment', 'stripe', ['Find Customer', 'Create Customer', 'Create Payment', 'Refund Payment']),
  application('woocommerce', 'WooCommerce', 'commerce', 'woocommerce', ['New Order', 'Find Customer', 'Update Order']),
  application('shopify', 'Shopify', 'commerce', 'shopify', ['New Order', 'Find Customer', 'Update Order']),
  application('xero', 'Xero', 'accounting', 'xero', ['Find Contact', 'Create Invoice', 'Update Invoice']),
  application('quickbooks', 'QuickBooks', 'accounting', 'quickbooks', ['Find Customer', 'Create Invoice', 'Update Invoice']),
  application('twilio', 'Twilio', 'messaging', 'twilio', ['Send SMS', 'Send WhatsApp Message', 'Make Call']),
  application('gmail', 'Gmail', 'email', 'gmail', ['New Email', 'Send Email', 'Create Draft']),
  application('outlook', 'Outlook', 'email', 'outlook', ['New Email', 'Send Email', 'Create Draft']),
  application('webhook', 'Webhook', 'api', 'webhook', ['Receive Request', 'Send Request']),
  application('rest-api', 'REST API', 'api', 'generic-api', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  application('database', 'Database', 'database', 'generic-database', ['Find Record', 'Create Record', 'Update Record']),
] as const;

export function resolveApplication(node: Pick<WorkflowNode, 'service' | 'name' | 'description' | 'category'>): ApplicationDefinition {
  const context = `${node.service ?? ''} ${node.name} ${node.description}`.toLowerCase();
  const known = applicationRegistry.find((item) => [item.name, ...item.aliases].some((candidate) => context.includes(candidate.toLowerCase())));
  if (known) return known;
  if (node.category === 'ai') return { id: 'generic-ai', name: node.service || 'AI Model', aliases: [], category: 'ai', icon: 'generic-ai', external: true, operations: ['Generate', 'Analyze', 'Classify'] };
  if (node.category === 'crm') return { id: 'generic-crm', name: node.service || 'CRM', aliases: [], category: 'crm', icon: 'generic-crm', external: true, operations: ['Find', 'Create', 'Update'] };
  if (node.category === 'database' || node.category === 'spreadsheet') return { id: 'generic-database', name: node.service || 'Database', aliases: [], category: 'database', icon: 'generic-database', external: true, operations: ['Find', 'Create', 'Update'] };
  if (node.category === 'api_request' || node.category === 'webhook') return { id: 'generic-api', name: node.service || 'REST API', aliases: [], category: 'api', icon: 'generic-api', external: true, operations: ['Receive Request', 'Send Request'] };
  return { id: 'internal', name: node.service || 'Workflow', aliases: [], category: 'workflow', icon: `generic-${node.category}`, external: false, operations: [] };
}

export function isExternalAction(node: WorkflowNode): boolean {
  return ['action', 'ai', 'api_request', 'webhook', 'database', 'crm', 'spreadsheet', 'email', 'messaging', 'notification'].includes(node.category) && resolveApplication(node).external;
}
