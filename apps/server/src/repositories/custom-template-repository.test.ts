import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultWorkflowSet,
  leadQualificationWorkflow,
  projectWorkflowToVisualGraph,
} from "@awm/shared";
import { createDatabase, type Database } from "../database/database.js";
import { CustomTemplateRepository } from "./custom-template-repository.js";
import { ProjectRepository } from "./project-repository.js";
import { CustomTemplateService } from "../services/custom-template-service.js";

const databases: Database[] = [];
afterEach(() => {
  while (databases.length) databases.pop()!.close();
});

const createInput = () => {
  const workflow = structuredClone(leadQualificationWorkflow);
  workflow.nodes[0]!.notes = "Keep the original lead source.";
  workflow.nodes[1]!.operation = "create_task";
  const visualGraph = projectWorkflowToVisualGraph(workflow);
  visualGraph.nodes[0]!.position = { x: 420, y: 180 };
  return {
    name: "Personal lead flow",
    description: "Reusable sales flow",
    category: "Sales",
    tags: ["crm", "lead"],
    snapshot: {
      originalScope: "Qualify the lead and preserve the decision branches.",
      platform: "n8n" as const,
      workflow,
      workflowSet: createDefaultWorkflowSet(workflow),
      visualGraph,
    },
  };
};

describe("CustomTemplateRepository", () => {
  it("persists, lists, edits, and deletes complete snapshots across repository reloads", () => {
    const database = createDatabase(":memory:");
    databases.push(database);
    const firstRepository = new CustomTemplateRepository(database);
    const created = firstRepository.create(createInput());
    const reloadedRepository = new CustomTemplateRepository(database);

    const loaded = reloadedRepository.list()[0]!;
    expect(loaded.snapshot.workflow.nodes[0]!.notes).toBe(
      "Keep the original lead source.",
    );
    expect(loaded.snapshot.workflow.nodes[1]!.operation).toBe("create_task");
    expect(loaded.snapshot.workflow.connections).toEqual(
      created.snapshot.workflow.connections,
    );
    expect(loaded.snapshot.visualGraph.nodes[0]!.position).toEqual({
      x: 420,
      y: 180,
    });

    const edited = reloadedRepository.update(created.id, {
      name: "Updated personal flow",
    })!;
    expect(edited.name).toBe("Updated personal flow");
    expect(edited.snapshot).toEqual(created.snapshot);
    expect(reloadedRepository.delete(created.id)).toBe(true);
    expect(reloadedRepository.list()).toEqual([]);
  });

  it("creates an independent project copy without mutating the stored template", () => {
    const database = createDatabase(":memory:");
    databases.push(database);
    const templates = new CustomTemplateRepository(database);
    const projects = new ProjectRepository(database);
    const service = new CustomTemplateService(templates, projects);
    const template = service.create(createInput());

    const project = service.instantiate(template.id)!;
    expect(project.workflow.nodes).toEqual(template.snapshot.workflow.nodes);
    expect(project.workflow).not.toBe(template.snapshot.workflow);
    project.workflow.nodes[0]!.notes = "Changed in working copy";

    expect(service.list()[0]!.snapshot.workflow.nodes[0]!.notes).toBe(
      "Keep the original lead source.",
    );
  });

  it("fails safely when a stored snapshot is malformed", () => {
    const database = createDatabase(":memory:");
    databases.push(database);
    const repository = new CustomTemplateRepository(database);
    const template = repository.create(createInput());
    database
      .prepare(
        "UPDATE custom_workflow_templates SET snapshot_json = ? WHERE id = ?",
      )
      .run('{"workflow":null}', template.id);

    expect(repository.list()).toEqual([]);
    expect(repository.findById(template.id)).toBeNull();
  });
});
