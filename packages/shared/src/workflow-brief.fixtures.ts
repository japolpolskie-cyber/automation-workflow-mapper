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
  routes: [],
  decisions: [],
  loops: [],
  waits: [],
  approvals: [],
  merges: [],
  iterators: [],
  aggregators: [],
  assumptions: [],
  missingInformation: [],
  warnings: [],
  completionCriteria: ['The CRM lead exists.', 'The sales team has been notified.'],
};

export const departmentRoutingWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0', id: 'department-routing', name: 'Department request routing',
  summary: 'Send each request to the responsible department.', objective: 'Route incoming requests by department.',
  sourceRequirement: 'Receive a request and route it to IT, Marketing, or Customer Support.',
  actors: [], applications: [],
  triggers: [{ id: 'request-received', name: 'Request received', description: 'A business request is received.', triggerType: 'form' }],
  actions: [
    { id: 'handle-it', name: 'Handle IT request', description: 'Send the request to IT.', inputs: ['request'], outputs: ['IT request'] },
    { id: 'handle-marketing', name: 'Handle marketing request', description: 'Send the request to Marketing.', inputs: ['request'], outputs: ['marketing request'] },
    { id: 'handle-support', name: 'Handle support request', description: 'Send the request to Customer Support.', inputs: ['request'], outputs: ['support request'] },
  ],
  routes: [
    { id: 'route-it', decisionId: 'department-decision', label: 'IT', condition: 'The request is for IT.', outcomeDescription: 'IT owns the request.', targetActionId: 'handle-it', isFallback: false },
    { id: 'route-marketing', decisionId: 'department-decision', label: 'Marketing', condition: 'The request is for Marketing.', outcomeDescription: 'Marketing owns the request.', targetActionId: 'handle-marketing', isFallback: false },
    { id: 'route-support', decisionId: 'department-decision', label: 'Customer Support', condition: 'The request is for Customer Support.', outcomeDescription: 'Customer Support owns the request.', targetActionId: 'handle-support', isFallback: false },
  ],
  decisions: [{ id: 'department-decision', name: 'Route by department', description: 'Choose the department responsible for the request.', decisionType: 'multi-route', conditionDescription: 'Which department owns the request?', routeIds: ['route-it', 'route-marketing', 'route-support'] }],
  loops: [], waits: [], approvals: [], merges: [], iterators: [], aggregators: [],
  assumptions: [], missingInformation: [], warnings: [], completionCriteria: ['The responsible department receives the request.'],
};

export const leadFollowUpWorkflowBrief: CanonicalWorkflowBrief = {
  schemaVersion: '1.0', id: 'lead-follow-up', name: 'Lead follow-up',
  summary: 'Contact a lead, wait for a response, and bound follow-up attempts.', objective: 'Qualify interested leads without unbounded follow-up.',
  sourceRequirement: 'Contact the lead, wait for a response, return interested leads to qualification, otherwise retry up to three times and exit.',
  actors: [], applications: [],
  triggers: [{ id: 'lead-ready', name: 'Lead ready for contact', description: 'A lead becomes ready for outreach.', triggerType: 'record-change' }],
  actions: [
    { id: 'contact-lead', name: 'Contact lead', description: 'Send the lead a business follow-up.', inputs: ['lead'], outputs: ['contact attempt'] },
    { id: 'qualify-lead', name: 'Qualify interested lead', description: 'Return the interested lead to qualification.', inputs: ['lead response'], outputs: ['qualification result'] },
    { id: 'record-no-interest', name: 'Record no interest', description: 'Record the terminal non-interest result.', inputs: ['lead response'], outputs: ['closed lead'] },
  ],
  routes: [
    { id: 'interested-route', decisionId: 'interest-decision', label: 'Interested', condition: 'The lead is interested.', outcomeDescription: 'Return the lead to qualification.', targetActionId: 'qualify-lead', isFallback: false },
    { id: 'not-interested-route', decisionId: 'interest-decision', label: 'Not Interested', condition: 'The lead is not interested or has not responded.', outcomeDescription: 'Continue the bounded follow-up before exit.', targetActionId: 'contact-lead', isFallback: false },
  ],
  decisions: [{ id: 'interest-decision', name: 'Evaluate lead interest', description: 'Determine whether the lead wants to continue.', decisionType: 'binary', conditionDescription: 'Is the lead interested?', routeIds: ['interested-route', 'not-interested-route'] }],
  loops: [{ id: 'follow-up-retry', name: 'Bounded lead follow-up', description: 'Retry contact up to three times before exit.', loopType: 'bounded-retry', entryActionId: 'contact-lead', bodyActionIds: ['contact-lead'], exitCondition: 'The lead responds or three attempts are completed.', maximumIterations: 3 }],
  waits: [{ id: 'response-wait', name: 'Wait for lead response', description: 'Pause until the lead responds.', waitType: 'until-response', boundaryDescription: 'Resume when the lead responds.', resumeActionId: 'qualify-lead', eventDescription: 'Lead response received.' }],
  approvals: [], merges: [], iterators: [], aggregators: [],
  assumptions: [], missingInformation: [], warnings: [], completionCriteria: ['Interested leads return to qualification.', 'Follow-up stops after three attempts.'],
};
