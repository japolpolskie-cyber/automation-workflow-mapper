import { describe, expect, it } from 'vitest';
import { SemanticRequirementAnalyzer } from './semantic-requirement-analyzer.js';

const analyzer = new SemanticRequirementAnalyzer();

describe('semantic requirement analysis', () => {
  it('preserves AI Agent, Router, and IF hierarchy', () => {
    const result = analyzer.analyze(`Create an n8n workflow for customer support.
The workflow should start when a customer submits a form through a webhook.
Use an AI Agent to analyze the message.
- OpenAI Chat Model
- Simple Memory
- HTTP Request Tool
- Vector Store Tool
After the AI Agent, use a Router with three routes:
1. Sales
2. Technical Support
3. Billing
Continue to an IF condition:
- TRUE: Send an urgent Slack notification
- FALSE: Log the request in Google Sheets
Finish successfully.`);

    const instruction = result.units.find((unit) => unit.kind === 'authoring-instruction');
    expect(instruction?.executable).toBe(false);

    const agent = result.units.find((unit) => unit.kind === 'ai-agent');
    const resources = result.units.filter((unit) => unit.kind === 'ai-resource');
    expect(resources).toHaveLength(4);
    expect(resources.every((unit) => unit.parentId === agent?.id && !unit.executable)).toBe(true);

    const router = result.units.find((unit) => unit.kind === 'router');
    const routes = result.units.filter((unit) => unit.kind === 'route');
    expect(routes.map((unit) => unit.text)).toEqual(['Sales', 'Technical Support', 'Billing']);
    expect(routes.every((unit) => unit.parentId === router?.id)).toBe(true);

    const condition = result.units.find((unit) => unit.kind === 'binary-condition');
    const branches = result.units.filter((unit) => unit.kind === 'branch');
    expect(branches.map((unit) => unit.branchLabel)).toEqual(['TRUE', 'FALSE']);
    expect(branches.every((unit) => unit.parentId === condition?.id)).toBe(true);
  });

  it('distinguishes sequence, temporal wait, and event wait', () => {
    const result = analyzer.analyze(`After the AI Agent, continue processing.
After ticket creation, continue to IF.
Wait five minutes.
Wait until tomorrow.
Wait for approval callback.`);
    expect(result.units.filter((unit) => unit.kind === 'sequence')).toHaveLength(2);
    expect(result.units.filter((unit) => unit.kind === 'temporal-wait')).toHaveLength(2);
    expect(result.units.filter((unit) => unit.kind === 'event-wait')).toHaveLength(1);
  });

  it('keeps authoring constraints non-executable', () => {
    const result = analyzer.analyze(`Use approximately 10 nodes.
Avoid duplicate steps.
Use n8n native nodes.
Do not invent credentials.`);
    expect(result.units).toHaveLength(4);
    expect(result.units.every((unit) => unit.kind === 'authoring-constraint' && !unit.executable)).toBe(true);
  });
});
