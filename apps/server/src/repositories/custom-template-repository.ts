import {
  customWorkflowTemplateSchema,
  type CreateCustomTemplateInput,
  type CustomWorkflowTemplate,
  type UpdateCustomTemplateInput,
} from "@awm/shared";
import type { Database } from "../database/database.js";

interface CustomTemplateRow {
  id: string;
  name: string;
  description: string;
  category: string;
  tags_json: string;
  snapshot_json: string;
  created_at: string;
  updated_at: string;
}

function parseRow(row: CustomTemplateRow): CustomWorkflowTemplate | null {
  try {
    const parsed = customWorkflowTemplateSchema.safeParse({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      tags: JSON.parse(row.tags_json) as unknown,
      snapshot: JSON.parse(row.snapshot_json) as unknown,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class CustomTemplateRepository {
  public constructor(private readonly database: Database) {}

  public list(): CustomWorkflowTemplate[] {
    return (
      this.database
        .prepare(
          "SELECT * FROM custom_workflow_templates ORDER BY updated_at DESC",
        )
        .all() as unknown as CustomTemplateRow[]
    ).flatMap((row) => {
      const template = parseRow(row);
      return template ? [template] : [];
    });
  }

  public findById(id: string): CustomWorkflowTemplate | null {
    const row = this.database
      .prepare("SELECT * FROM custom_workflow_templates WHERE id = ?")
      .get(id) as unknown as CustomTemplateRow | undefined;
    return row ? parseRow(row) : null;
  }

  public create(input: CreateCustomTemplateInput): CustomWorkflowTemplate {
    const now = new Date().toISOString();
    const template = customWorkflowTemplateSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    this.database
      .prepare(
        `INSERT INTO custom_workflow_templates
      (id, name, description, category, tags_json, snapshot_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        template.id,
        template.name,
        template.description,
        template.category,
        JSON.stringify(template.tags),
        JSON.stringify(template.snapshot),
        now,
        now,
      );
    return template;
  }

  public update(
    id: string,
    input: UpdateCustomTemplateInput,
  ): CustomWorkflowTemplate | null {
    const current = this.findById(id);
    if (!current) return null;
    const updated = customWorkflowTemplateSchema.parse({
      ...current,
      ...input,
      updatedAt: new Date().toISOString(),
    });
    this.database
      .prepare(
        `UPDATE custom_workflow_templates
      SET name = ?, description = ?, category = ?, tags_json = ?, updated_at = ?
      WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.description,
        updated.category,
        JSON.stringify(updated.tags),
        updated.updatedAt,
        id,
      );
    return updated;
  }

  public delete(id: string): boolean {
    return (
      this.database
        .prepare("DELETE FROM custom_workflow_templates WHERE id = ?")
        .run(id).changes > 0
    );
  }
}
