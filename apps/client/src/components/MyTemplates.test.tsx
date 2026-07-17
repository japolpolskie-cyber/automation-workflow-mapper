// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  createDefaultWorkflowSet,
  leadQualificationWorkflow,
  projectWorkflowToVisualGraph,
  type CustomWorkflowTemplate,
} from "@awm/shared";
import { describe, expect, it, vi } from "vitest";
import { MyTemplates } from "./MyTemplates";

const template: CustomWorkflowTemplate = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Personal lead flow",
  description: "A personal template",
  category: "Sales",
  tags: ["crm"],
  snapshot: {
    originalScope: "Qualify a lead.",
    platform: "n8n",
    workflow: leadQualificationWorkflow,
    workflowSet: createDefaultWorkflowSet(leadQualificationWorkflow),
    visualGraph: projectWorkflowToVisualGraph(leadQualificationWorkflow),
  },
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
};

describe("MyTemplates", () => {
  it("exposes use, edit, and delete actions separately", () => {
    const onUse = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <MyTemplates
        templates={[template]}
        busyId={null}
        onUse={onUse}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Use template/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Edit Personal lead flow/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Delete Personal lead flow/i }),
    );
    expect(onUse).toHaveBeenCalledWith(template);
    expect(onEdit).toHaveBeenCalledWith(template);
    expect(onDelete).toHaveBeenCalledWith(template);
  });
});
