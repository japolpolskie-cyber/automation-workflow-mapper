import type { Platform } from '@awm/shared';

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  platform: Platform;
  scope: string;
}

export const workflowTemplates: WorkflowTemplate[] = [
  { id: 'lead-management', name: 'Lead Management', category: 'Sales', platform: 'n8n', description: 'Qualify inbound leads and route the next action.', scope: 'When a new lead arrives through a website webhook, validate the email address and retrieve the matching CRM contact. If the lead is qualified, create an Asana follow-up task and notify the sales channel in Slack; otherwise log the reason in Google Sheets.' },
  { id: 'employee-onboarding', name: 'Employee Onboarding', category: 'HR', platform: 'make', description: 'Coordinate approval, documents, and welcome tasks.', scope: 'When a new employee row is approved in Google Sheets, create an onboarding project in Asana, create an employee folder in Google Drive, send a Gmail welcome message, and notify the hiring manager in Slack.' },
  { id: 'invoice-approval', name: 'Invoice Approval', category: 'Finance', platform: 'n8n', description: 'Review invoices with explicit approve and reject paths.', scope: 'When Gmail receives an invoice with an attachment, retrieve the attachment and request approval from the finance manager. If approved, log the invoice in Google Sheets and notify Slack. If rejected, send the supplier a Gmail explanation.' },
  { id: 'customer-support', name: 'Customer Support', category: 'Support', platform: 'n8n', description: 'Triage tickets by priority and escalate urgent work.', scope: 'When a support ticket is received by webhook, validate the requester details and route the ticket by priority: Standard, High, Urgent, or Unknown. Create an Asana task for the matching queue and alert Slack for Urgent tickets.' },
  { id: 'order-processing', name: 'Order Processing', category: 'Commerce', platform: 'make', description: 'Validate and coordinate paid customer orders.', scope: 'When a Shopify order is paid, retrieve the order details, validate inventory, create the fulfillment task, send a Gmail confirmation, and log the order in Google Sheets. If inventory is insufficient, notify the operations team in Slack.' },
  { id: 'marketing-campaign', name: 'Marketing Campaign', category: 'Marketing', platform: 'make', description: 'Approve campaign work before publishing begins.', scope: 'When an Asana campaign task reaches Ready for Review, request approval from the marketing manager. If approved, notify Slack and create the publishing tasks. If rejected, update the Asana task with the revision status.' },
  { id: 'crm-follow-up', name: 'CRM Follow-up', category: 'Sales', platform: 'n8n', description: 'Follow up safely until a lead responds.', scope: 'When a CRM lead enters Follow-up, send a Gmail reminder every three days until the lead responds, for a maximum of four attempts. If there is still no response, alert the sales manager in Slack and stop.' },
  { id: 'document-approval', name: 'Document Approval', category: 'Operations', platform: 'make', description: 'Review uploaded documents with clear outcomes.', scope: 'When a document is uploaded to Google Drive, request approval from the document owner. If approved, move it to the Approved folder and notify Slack. If rejected, move it to Needs Revision and send a Gmail revision request.' },
  { id: 'social-publishing', name: 'Social Media Publishing', category: 'Marketing', platform: 'zapier', description: 'Schedule an approved collection of social posts.', scope: 'Every weekday, retrieve approved social posts from Google Sheets and process each post. Schedule each post through the connected publishing API, record the result in Google Sheets, and alert Slack if publishing fails.' },
  { id: 'inventory-notifications', name: 'Inventory Notifications', category: 'Operations', platform: 'zapier', description: 'Monitor stock and alert the correct team.', scope: 'Every morning, retrieve low-stock rows from Google Sheets and process each item. If stock is below the reorder threshold, notify the purchasing channel in Slack and create an Asana restock task.' },
];

