import { validateWorkflow, type CanonicalWorkflow, type Platform } from '@awm/shared';
import { buildPlatformPlan } from './index.js';

export function generateImplementationMarkdown(workflow: CanonicalWorkflow, platform: Platform): string {
  const plan = buildPlatformPlan(platform, workflow);
  const validation = validateWorkflow(workflow, platform, plan.validationIssues);
  const lines = [
    `# ${workflow.name}`, '', '> Draft export — review required before platform implementation.', '',
    '## Project overview', '', workflow.summary || 'No summary supplied.', '',
    `**Business objective:** ${workflow.objective || 'Confirm with the project owner.'}`,
    `**Target platform:** ${plan.platformName}`, `**Complexity:** ${validation.complexity} (${validation.complexityScore}/100)`,
    `**Relative usage:** ${validation.usageEstimate}`, '', '## Applications', '',
  ];
  const applications = [...new Set(plan.nodes.map((node) => node.appName).filter(Boolean))];
  lines.push(...(applications.length ? applications.map((item) => `- ${item}`) : ['- No external applications identified.']));
  lines.push('', '## Workflow implementation steps', '');
  for (const node of plan.nodes) {
    lines.push(`### ${node.stepNumber}. ${node.appName} — ${node.event}`, '', `**Platform component:** ${node.stepType}`, '');
    if (node.configurationNotes.length) lines.push(...node.configurationNotes.map((note) => `- ${note}`));
    if (node.inputFields.length) lines.push('', '**Required or suggested inputs**', '', ...node.inputFields.map((field) => `- ${field}`));
    if (node.implementationSteps.length) lines.push('', '**Implementation checklist**', '', ...node.implementationSteps.map((step) => `- [ ] ${step}`));
    lines.push('');
  }
  lines.push('## Connections and branching', '');
  lines.push(...(plan.connections.length
    ? plan.connections.map((edge) => `- ${edge.sourceNodeId} → ${edge.targetNodeId}${edge.label ? ` — ${edge.label}` : ''}${edge.condition ? ` (${edge.condition})` : ''}`)
    : ['- No saved connections. Review inferred execution order.']));
  lines.push('', '## Error handling and validation', '');
  lines.push(...(validation.issues.length
    ? validation.issues.map((issue) => `- **${issue.severity.toUpperCase()} — ${issue.code}:** ${issue.message}`)
    : ['- No validation issues detected.']));
  lines.push('', '## Testing plan', '', '- [ ] Connect test or sandbox credentials.', '- [ ] Test each trigger with representative sample data.', '- [ ] Verify field mappings and transformations.', '- [ ] Exercise every condition and error route.', '- [ ] Confirm duplicate prevention and retry behavior.', '- [ ] Obtain business-owner approval before activation.', '', '## Deployment and maintenance checklist', '', '- [ ] Replace all credential placeholders.', '- [ ] Document ownership and alert recipients.', '- [ ] Enable platform execution monitoring.', '- [ ] Record rollback and manual recovery procedures.', '- [ ] Schedule a post-launch review.', '');
  return lines.join('\n');
}

export function generateImplementationChecklist(workflow: CanonicalWorkflow, platform: Platform): string {
  const plan = buildPlatformPlan(platform, workflow);
  return [
    `# ${workflow.name} — ${plan.platformName} implementation checklist`, '',
    '> Draft export — review required before platform implementation.', '',
    ...plan.nodes.flatMap((node) => [`## ${node.stepNumber}. ${node.appName}: ${node.event}`, ...node.implementationSteps.map((step) => `- [ ] ${step}`), '']),
  ].join('\n');
}
