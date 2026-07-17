import { describe, expect, it } from "vitest";
import { createDefaultWorkflowSet } from "./workflow-set.js";
import { createCustomTemplateSchema } from "./custom-template.js";
import { leadQualificationWorkflow } from "./fixtures.js";
import { projectWorkflowToVisualGraph } from "./graph.js";

const validInput = {
  name: "Lead follow-up",
  description: "",
  category: "Sales",
  tags: ["crm"],
  snapshot: {
    originalScope: "Follow up with a qualified lead.",
    platform: "n8n" as const,
    workflow: leadQualificationWorkflow,
    workflowSet: createDefaultWorkflowSet(leadQualificationWorkflow),
    visualGraph: projectWorkflowToVisualGraph(leadQualificationWorkflow),
  },
};

describe("custom template contracts", () => {
  it("accepts a complete canonical workflow snapshot", () => {
    expect(
      createCustomTemplateSchema.parse(validInput).snapshot.workflow.nodes
        .length,
    ).toBeGreaterThan(0);
  });

  it("requires a name and a non-empty workflow", () => {
    expect(
      createCustomTemplateSchema.safeParse({ ...validInput, name: " " })
        .success,
    ).toBe(false);
    expect(
      createCustomTemplateSchema.safeParse({
        ...validInput,
        snapshot: {
          ...validInput.snapshot,
          workflow: { ...leadQualificationWorkflow, nodes: [] },
        },
      }).success,
    ).toBe(false);
  });
});
