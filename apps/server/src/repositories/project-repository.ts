import type { CanonicalWorkflow, CreateProjectInput, Project, WorkflowSet } from '@awm/shared';
import { createDefaultWorkflowSet, createWorkflowSetFromGraph, migrateWorkflow, normalizeWorkflowSet, projectSchema, projectWorkflowToVisualGraph, workflowSetSchema } from '@awm/shared';
import type { Database } from '../database/database.js';

interface ProjectRow {
  id: string; name: string; client_name: string; description: string; platform: Project['platform'];
  status: Project['status']; original_scope: string; workflow_json: string; workflow_set_json: string | null; visual_graph_json: string; created_at: string; updated_at: string;
}

function toProject(row: ProjectRow): Project {
  const workflow = migrateWorkflow(JSON.parse(row.workflow_json) as unknown);
  const parsedWorkflowSet = row.workflow_set_json ? workflowSetSchema.parse(JSON.parse(row.workflow_set_json) as unknown) : createDefaultWorkflowSet(workflow, row.updated_at);
  const workflowSet = normalizeWorkflowSet(workflow, parsedWorkflowSet);
  return projectSchema.parse({
    id: row.id, name: row.name, clientName: row.client_name, description: row.description,
    platform: row.platform, status: row.status, originalScope: row.original_scope,
    workflow, workflowSet, createdAt: row.created_at, updatedAt: row.updated_at
    ,visualGraph: JSON.parse(row.visual_graph_json) as unknown
  });
}

export class ProjectRepository {
  public constructor(private readonly database: Database) {}

  public list(): Project[] {
    return (this.database.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as unknown as ProjectRow[]).map(toProject);
  }

  public findById(id: string): Project | null {
    const row = this.database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }

  public create(input: CreateProjectInput): Project {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const workflow: CanonicalWorkflow = {
      schemaVersion: '2.0', id: crypto.randomUUID(), name: input.name, summary: '', objective: '',
      targetPlatform: input.platform, confidence: null, actors: [], systems: [], nodes: [], connections: [],
      branches: [], errorHandling: [], clarificationQuestions: [], risks: [], complexity: 'simple',
      assumptions: [], missingInformation: [], warnings: [], recommendations: [], completionCriteria: [], estimatedExecutionTime: '', createdAt: now, updatedAt: now
    };
    const workflowSet = createDefaultWorkflowSet(workflow, now);
    const project = projectSchema.parse({ ...input, id, status: 'draft', originalScope: '', workflow, workflowSet, createdAt: now, updatedAt: now });
    const transaction = this.database.prepare(`INSERT INTO projects
      (id, name, client_name, description, platform, status, original_scope, workflow_json, workflow_set_json, visual_graph_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    transaction.run(id, project.name, project.clientName, project.description, project.platform, project.status, '', JSON.stringify(workflow), JSON.stringify(workflowSet), JSON.stringify({ nodes: [], edges: [] }), now, now);
    this.database.prepare(`INSERT INTO project_versions (id, project_id, version_number, event_type, snapshot_json, created_at)
      VALUES (?, ?, 1, 'project_created', ?, ?)`).run(crypto.randomUUID(), id, JSON.stringify(project), now);
    return project;
  }

  public updateScope(id: string, originalScope: string): Project | null {
    const current = this.findById(id);
    if (!current) return null;
    const now = new Date().toISOString();
    const updated = projectSchema.parse({ ...current, originalScope, updatedAt: now });
    const versionRow = this.database.prepare('SELECT COALESCE(MAX(version_number), 0) AS version FROM project_versions WHERE project_id = ?').get(id) as { version: number };
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('UPDATE projects SET original_scope = ?, updated_at = ? WHERE id = ?').run(originalScope, now, id);
      this.database.prepare(`INSERT INTO project_versions (id, project_id, version_number, event_type, snapshot_json, created_at)
        VALUES (?, ?, ?, 'scope_updated', ?, ?)`).run(crypto.randomUUID(), id, versionRow.version + 1, JSON.stringify(updated), now);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return updated;
  }

  public updateWorkflow(id: string, workflow: CanonicalWorkflow): Project | null {
    const current = this.findById(id); if (!current) return null;
    const now = new Date().toISOString();
    const visualGraph = projectWorkflowToVisualGraph(workflow);
    const updatedWorkflow = { ...workflow, updatedAt: now };
    const incomingNodeIds = new Set(updatedWorkflow.nodes.map((node) => node.id));
    const retainsKnownOwnership = current.workflowSet.nodeReferences.some((reference) => incomingNodeIds.has(reference.resourceId));
    const workflowSet = !retainsKnownOwnership
      ? createWorkflowSetFromGraph(updatedWorkflow, now)
      : normalizeWorkflowSet(updatedWorkflow, current.workflowSet);
    const updated = projectSchema.parse({ ...current, workflow: updatedWorkflow, workflowSet, visualGraph, status: workflow.missingInformation.length ? 'needs_input' : 'ready', updatedAt: now });
    const versionRow = this.database.prepare('SELECT COALESCE(MAX(version_number), 0) AS version FROM project_versions WHERE project_id = ?').get(id) as { version: number };
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('UPDATE projects SET workflow_json = ?, workflow_set_json = ?, visual_graph_json = ?, status = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updated.workflow), JSON.stringify(workflowSet), JSON.stringify(visualGraph), updated.status, now, id);
      this.database.prepare(`INSERT INTO project_versions (id, project_id, version_number, event_type, snapshot_json, created_at) VALUES (?, ?, ?, 'workflow_analyzed', ?, ?)`).run(crypto.randomUUID(), id, versionRow.version + 1, JSON.stringify(updated), now);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    return updated;
  }

  public updateEditor(id: string, workflow: CanonicalWorkflow, workflowSet: WorkflowSet | undefined, visualGraph: Project['visualGraph']): Project | null {
    const current = this.findById(id); if (!current) return null;
    const now = new Date().toISOString();
    const updatedWorkflow = { ...workflow, updatedAt: now };
    const normalizedSet = normalizeWorkflowSet(updatedWorkflow, workflowSet ?? current.workflowSet);
    const updated = projectSchema.parse({ ...current, workflow: updatedWorkflow, workflowSet: normalizedSet, visualGraph, updatedAt: now });
    const versionRow = this.database.prepare('SELECT COALESCE(MAX(version_number), 0) AS version FROM project_versions WHERE project_id = ?').get(id) as { version: number };
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('UPDATE projects SET workflow_json = ?, workflow_set_json = ?, visual_graph_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updated.workflow), JSON.stringify(normalizedSet), JSON.stringify(visualGraph), now, id);
      this.database.prepare(`INSERT INTO project_versions (id, project_id, version_number, event_type, snapshot_json, created_at) VALUES (?, ?, ?, 'graph_edited', ?, ?)`).run(crypto.randomUUID(), id, versionRow.version + 1, JSON.stringify(updated), now);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    return updated;
  }
}
