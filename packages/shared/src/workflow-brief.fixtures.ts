import type { CanonicalWorkflowBrief } from './workflow-brief.js';

export const websiteEnquiryWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0',
  id: 'website-enquiry-brief',
  name: 'Website enquiry intake',
  summary: 'Capture a website enquiry, create a lead, and inform sales.',
  objective: 'Ensure every website enquiry becomes a CRM lead and reaches the sales team.',
  sourceRequirement: 'Receive a website enquiry, create a CRM lead, and notify the sales team.',
  actors: [
    { id: 'sales-team', name: 'Sales team', role: 'Lead owner', description: 'Reviews and follows up on new enquiries.' },
  ],
  applications: [
    { id: 'website', name: 'Website', purpose: 'Collect enquiries.', explicitlyMentioned: true },
    { id: 'crm', name: 'CRM', purpose: 'Store sales leads.', explicitlyMentioned: true },
  ],
  triggers: [
    { id: 'enquiry-received', name: 'Website enquiry received', description: 'A visitor submits a website enquiry.', applicationId: 'website', triggerType: 'form' },
  ],
  actions: [
    { id: 'create-lead', name: 'Create CRM lead', description: 'Create a lead from the submitted enquiry.', applicationId: 'crm', inputs: ['enquiry details'], outputs: ['lead record'] },
    { id: 'notify-sales', name: 'Notify sales team', description: 'Inform the sales team that a new lead is available.', actorId: 'sales-team', inputs: ['lead record'], outputs: ['sales notification'] },
  ],
  assumptions: [],
  missingInformation: [],
  warnings: [],
  completionCriteria: ['The CRM lead exists.', 'The sales team has been notified.'],
};

