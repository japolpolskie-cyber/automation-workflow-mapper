import type { PlatformNodeDefinition } from '@awm/shared';

const definition = (type: string, label: string, category: string, appName: string, events: string[], credentialType: string | null, requiredInputs: string[] = [], expectedOutputs: string[] = [], limitations: string[] = []): PlatformNodeDefinition => ({ type, label, category, appName, events, credentialType, requiredInputs, expectedOutputs, limitations, capabilities: events });

export const zapierCatalog = [
  definition('app_trigger', 'App trigger', 'trigger', 'Connected app', ['New Record', 'Updated Record', 'New or Updated Record'], 'App OAuth connection'),
  definition('app_action', 'App action', 'action', 'Connected app', ['Create Record', 'Update Record', 'Find Record', 'Create or Update Record'], 'App OAuth connection'),
  definition('filter', 'Filter by Zapier', 'filter', 'Filter by Zapier', ['Only continue if'], null, ['Field', 'Condition', 'Value']),
  definition('paths', 'Paths by Zapier', 'router', 'Paths by Zapier', ['Branch into paths'], null, ['Path conditions'], [], ['Paths add complexity; split large workflows into multiple Zaps.']),
  definition('formatter', 'Formatter by Zapier', 'transformation', 'Formatter by Zapier', ['Text', 'Numbers', 'Date / Time', 'Utilities'], null, ['Input', 'Transform']),
  definition('delay', 'Delay by Zapier', 'delay', 'Delay by Zapier', ['Delay For', 'Delay Until', 'Delay After Queue'], null, ['Duration or date']),
  definition('looping', 'Looping by Zapier', 'loop', 'Looping by Zapier', ['Create Loop From Line Items'], null, ['Line items'], [], ['Downstream actions consume tasks for every loop iteration.']),
  definition('webhook', 'Webhooks by Zapier', 'api_request', 'Webhooks by Zapier', ['GET', 'POST', 'PUT', 'Custom Request'], null, ['URL', 'Method'], ['Response body'], ['Review authentication and rate limits.']),
  definition('notification', 'Notification action', 'notification', 'Connected messaging app', ['Send Message', 'Send Email'], 'Messaging app connection'),
  definition('approval', 'Manual approval pattern', 'human_approval', 'Approval app', ['Request Approval'], 'Approval app connection', ['Approver', 'Request details']),
  definition('error', 'Zap error handling', 'error_handler', 'Zapier Manager', ['Notify on Zap Error'], 'Zapier connection'),
  definition('storage', 'Storage by Zapier', 'logger', 'Storage by Zapier', ['Set Value', 'Increment Value'], null),
  definition('sub_zap', 'Sub-Zap', 'sub_workflow', 'Sub-Zap by Zapier', ['Call a Sub-Zap'], null)
] as const;

export const makeCatalog = [
  definition('trigger_module', 'Trigger module', 'trigger', 'Connected app', ['Watch records', 'Watch events', 'Instant webhook'], 'App connection'),
  definition('action_module', 'Action module', 'action', 'Connected app', ['Create a record', 'Update a record', 'Search records'], 'App connection'),
  definition('filter', 'Route filter', 'filter', 'Make filter', ['Filter bundle'], null, ['Condition']),
  definition('router', 'Router', 'router', 'Flow control', ['Router'], null),
  definition('tools', 'Tools transformer', 'transformation', 'Tools', ['Set variable', 'Compose a string', 'Parse data'], null),
  definition('sleep', 'Sleep', 'delay', 'Tools', ['Sleep'], null, ['Duration']),
  definition('iterator', 'Iterator', 'loop', 'Tools', ['Iterator', 'Repeater', 'Array aggregator'], null, ['Array']),
  definition('http', 'HTTP module', 'api_request', 'HTTP', ['Make a request'], null, ['URL', 'Method'], ['Bundle'], ['Review authentication and operation usage.']),
  definition('notification', 'Messaging module', 'notification', 'Connected messaging app', ['Send a message', 'Send an email'], 'App connection'),
  definition('approval', 'Approval pattern', 'human_approval', 'Connected approval app', ['Create approval request'], 'App connection'),
  definition('error_handler', 'Error handler route', 'error_handler', 'Make error handler', ['Resume', 'Ignore', 'Rollback', 'Commit'], null),
  definition('data_store', 'Data store', 'logger', 'Data store', ['Add/replace a record', 'Search records'], null)
] as const;

export const n8nCatalog = [
  definition('trigger', 'Trigger node', 'trigger', 'Connected app', ['On event', 'Polling trigger', 'Webhook trigger'], 'App credential'),
  definition('action', 'Action node', 'action', 'Connected app', ['Create', 'Update', 'Get', 'Get Many'], 'App credential'),
  definition('if', 'IF node', 'filter', 'n8n', ['IF'], null, ['Conditions']),
  definition('switch', 'Switch node', 'router', 'n8n', ['Switch'], null, ['Routing rules']),
  definition('edit_fields', 'Edit Fields node', 'transformation', 'n8n', ['Set fields', 'JSON output'], null),
  definition('wait', 'Wait node', 'delay', 'n8n', ['After time interval', 'At specified time', 'On webhook call'], null),
  definition('loop', 'Loop Over Items node', 'loop', 'n8n', ['Loop Over Items', 'Split Out', 'Aggregate'], null, ['Batch size']),
  definition('http_request', 'HTTP Request node', 'api_request', 'n8n', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], 'Header/OAuth credential', ['URL', 'Method'], ['Body', 'Status code'], ['Review pagination, authentication, and rate limits.']),
  definition('notification', 'Messaging node', 'notification', 'Connected messaging app', ['Send message', 'Send email'], 'App credential'),
  definition('approval', 'Human approval pattern', 'human_approval', 'Wait + messaging nodes', ['Send request and wait for response'], 'Messaging credential'),
  definition('error_trigger', 'Error Trigger node', 'error_handler', 'n8n', ['Error Trigger'], null),
  definition('log', 'Logging node', 'logger', 'n8n', ['Code', 'Data store', 'External log action'], null),
  definition('execute_workflow', 'Execute Workflow node', 'sub_workflow', 'n8n', ['Execute sub-workflow'], null)
] as const;
