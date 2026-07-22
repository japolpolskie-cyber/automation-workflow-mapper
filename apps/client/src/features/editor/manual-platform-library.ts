import type { Platform, WorkflowNode } from '@awm/shared';

export interface ManualLibraryItem {
  id: string;
  label: string;
  category: WorkflowNode['category'];
  service: string | null;
  operation: string | null;
  configuration?: Record<string, unknown>;
}

export interface ManualPlatformLibrary {
  title: string;
  itemNoun: string;
  workflowNoun: string;
  items: ManualLibraryItem[];
}

const item = (
  id: string,
  label: string,
  category: WorkflowNode['category'],
  service: string | null = null,
  operation: string | null = null,
  configuration?: Record<string, unknown>,
): ManualLibraryItem => ({ id, label, category, service, operation, ...(configuration ? { configuration } : {}) });

const customNode = item('custom', 'Custom Node', 'action', null, null, {
  manualCustomNode: true,
  dynamicConnections: true,
  editorBranchControl: 'dynamic',
});

export const manualPlatformLibraries: Record<Platform, ManualPlatformLibrary> = {
  n8n: {
    title: 'Node Library',
    itemNoun: 'node',
    workflowNoun: 'workflow',
    items: [
      item('trigger', 'Trigger', 'trigger', 'n8n', 'Trigger'),
      item('webhook', 'Webhook', 'webhook', 'n8n', 'Webhook'),
      item('action', 'Action', 'action'), item('ai', 'AI', 'ai'),
      item('condition', 'IF', 'condition', 'n8n', 'IF', { editorBranchControl: 'fixed-binary' }), item('router', 'Switch / Router', 'router', 'n8n', 'Switch', { editorBranchControl: 'dynamic' }),
      item('transform', 'Transform', 'transformation'), item('delay', 'Delay / Wait', 'delay'),
      item('loop', 'Loop', 'loop'), item('http', 'HTTP Request', 'api_request', 'HTTP', 'Request'),
      item('database', 'Database', 'database'), item('crm', 'CRM', 'crm'),
      item('spreadsheet', 'Spreadsheet', 'spreadsheet'), item('email', 'Email', 'email'),
      item('messaging', 'Messaging', 'messaging'), item('notification', 'Notification', 'notification'),
      item('approval', 'Approval', 'human_approval', null, null, { editorBranchControl: 'fixed-control' }), item('retry', 'Retry', 'retry', null, null, { editorBranchControl: 'fixed-control' }),
      item('error', 'Error Handler', 'error_handler', 'n8n', 'Error Handler', { editorBranchControl: 'fixed-control', editorFixedOutputs: [{ id: 'default', label: 'Continue' }, { id: 'error', label: 'Error' }] }), item('merge', 'Merge', 'merge'),
      item('sub-workflow', 'Execute Workflow', 'sub_workflow', 'n8n', 'Execute Workflow'),
      item('end', 'End', 'end'), customNode,
    ],
  },
  make: {
    title: 'Module Library',
    itemNoun: 'module',
    workflowNoun: 'scenario',
    items: [
      item('trigger', 'Trigger Module', 'trigger', 'Make.com', 'Trigger'),
      item('webhook', 'Webhook', 'webhook', 'Make.com', 'Custom webhook'),
      item('action', 'Action Module', 'action'), item('router', 'Router', 'router', 'Make.com', 'Router', { editorBranchControl: 'dynamic' }),
      item('filter', 'Filter', 'filter', 'Make.com', 'Filter'),
      item('iterator', 'Iterator', 'loop', 'Make.com', 'Iterator', { collectionMode: 'iterator' }),
      item('aggregator', 'Array Aggregator', 'merge', 'Make.com', 'Array Aggregator', { collectionMode: 'aggregator' }),
      item('transform', 'Data Transformer', 'transformation'), item('delay', 'Sleep', 'delay', 'Make.com', 'Sleep'),
      item('http', 'HTTP Module', 'api_request', 'HTTP', 'Make a request'),
      item('database', 'Database', 'database'), item('crm', 'CRM', 'crm'),
      item('spreadsheet', 'Spreadsheet', 'spreadsheet'), item('email', 'Email', 'email'),
      item('messaging', 'Messaging', 'messaging'), item('notification', 'Notification', 'notification'),
      item('approval', 'Approval', 'human_approval'), item('retry', 'Retry', 'retry'),
      item('error', 'Error Handler', 'error_handler', 'Make.com', 'Error Handler', { editorBranchControl: 'fixed-control', editorFixedOutputs: [{ id: 'default', label: 'Continue' }, { id: 'error', label: 'Error' }] }), item('sub-scenario', 'Callable Scenario', 'sub_workflow', 'Make.com', 'Callable scenario'),
      item('end', 'End', 'end'), customNode,
    ],
  },
  zapier: {
    title: 'Steps Library',
    itemNoun: 'step',
    workflowNoun: 'Zap',
    items: [
      item('trigger', 'Zap Trigger', 'trigger', 'Zapier', 'Trigger'),
      item('action', 'Action', 'action'), item('paths', 'Paths', 'router', 'Zapier', 'Paths', { editorBranchControl: 'dynamic' }),
      item('filter', 'Filter', 'filter', 'Zapier', 'Filter'),
      item('delay', 'Delay', 'delay', 'Delay by Zapier', 'Delay'),
      item('formatter', 'Formatter', 'transformation', 'Formatter by Zapier', 'Transform'),
      item('looping', 'Looping', 'loop', 'Looping by Zapier', 'Create loop', { collectionMode: 'iterator' }),
      item('webhooks', 'Webhooks', 'webhook', 'Webhooks by Zapier', 'Webhook'),
      item('database', 'Database', 'database'), item('crm', 'CRM', 'crm'),
      item('spreadsheet', 'Spreadsheet', 'spreadsheet'), item('email', 'Email', 'email'),
      item('messaging', 'Messaging', 'messaging'), item('notification', 'Notification', 'notification'),
      item('approval', 'Approval', 'human_approval'), item('retry', 'Retry Metadata', 'retry'),
      item('error', 'Failure Path', 'error_handler'), item('sub-zap', 'Sub-Zap', 'sub_workflow', 'Zapier', 'Sub-Zap'),
      item('end', 'End', 'end'), customNode,
    ],
  },
};

export const manualLibraryFor = (platform: Platform): ManualPlatformLibrary => manualPlatformLibraries[platform];
