// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createDefaultWorkflowSet,
  leadQualificationWorkflow,
  projectWorkflowToVisualGraph,
} from "@awm/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomTemplateDialog } from "./CustomTemplateDialog";

const snapshot = {
  originalScope: "Qualify a lead.",
  platform: "n8n" as const,
  workflow: leadQualificationWorkflow,
  workflowSet: createDefaultWorkflowSet(leadQualificationWorkflow),
  visualGraph: projectWorkflowToVisualGraph(leadQualificationWorkflow),
};

describe("CustomTemplateDialog", () => {
  afterEach(cleanup);
  it("requires a template name before saving", async () => {
    const onSave = vi.fn();
    render(
      <CustomTemplateDialog
        open
        busy={false}
        snapshot={snapshot}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Template name/i), {
      target: { value: "" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save template" }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a template name",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("sends normalized metadata with the original snapshot", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomTemplateDialog
        open
        busy={false}
        snapshot={snapshot}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Labels/i), {
      target: { value: "crm, lead, crm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["crm", "lead"] }),
        snapshot,
      ),
    );
  });
});
