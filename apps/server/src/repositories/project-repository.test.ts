import { afterEach, describe, expect, it } from 'vitest';
import { leadQualificationWorkflow } from '@awm/shared';
import { createDatabase, type Database } from '../database/database.js';
import { ProjectRepository } from './project-repository.js';

const databases: Database[] = [];
afterEach(() => { while (databases.length) databases.pop()!.close(); });

describe('ProjectRepository workflow-set persistence', () => {
  it('loads a legacy project with a synthesized default workflow set', () => {
    const database = createDatabase(':memory:'); databases.push(database);
    const repository = new ProjectRepository(database);
    const created = repository.create({ name: 'Legacy project', clientName: '', description: '', platform: 'n8n' });
    database.prepare('UPDATE projects SET workflow_set_json = NULL WHERE id = ?').run(created.id);

    const loaded = repository.findById(created.id)!;

    expect(loaded.workflowSet.workflows).toHaveLength(1);
    expect(loaded.workflowSet.workflows[0]).toMatchObject({ id: loaded.workflow.id, name: loaded.workflow.name });
  });

  it('persists independent workflows and explicit shared-node references', () => {
    const database = createDatabase(':memory:'); databases.push(database);
    const repository = new ProjectRepository(database);
    const project = repository.create({ name: 'Asana CRM', clientName: '', description: '', platform: 'n8n' });
    const secondTrigger = { ...leadQualificationWorkflow.nodes[0]!, id: '70000000-0000-4000-8000-000000000001', name: 'Receive renewal reminder' };
    const analyzed = repository.updateWorkflow(project.id, { ...leadQualificationWorkflow, nodes: [...leadQualificationWorkflow.nodes, secondTrigger] })!;
    expect(analyzed.workflowSet.workflows).toHaveLength(2);

    const firstReference = analyzed.workflowSet.nodeReferences[0]!;
    const secondWorkflowId = analyzed.workflowSet.workflows[1]!.id;
    const sharedSet = {
      ...analyzed.workflowSet,
      nodeReferences: [{ ...firstReference, referencedByWorkflowIds: [secondWorkflowId] }, ...analyzed.workflowSet.nodeReferences.slice(1)],
    };
    repository.updateEditor(project.id, analyzed.workflow, sharedSet, analyzed.visualGraph);
    const reloaded = repository.findById(project.id)!;

    expect(reloaded.workflowSet.nodeReferences[0]!.referencedByWorkflowIds).toContain(secondWorkflowId);
    expect(reloaded.workflow.nodes.filter((node) => node.id === firstReference.resourceId)).toHaveLength(1);
  });

  it('archives a project without deleting its workflow history', () => {
    const database = createDatabase(':memory:'); databases.push(database);
    const repository = new ProjectRepository(database);
    const project = repository.create({ name: 'Old workflow', clientName: '', description: '', platform: 'n8n' });

    const archived = repository.archive(project.id);

    expect(archived?.status).toBe('archived');
    expect(repository.list()).toHaveLength(0);
    expect(repository.findById(project.id)?.status).toBe('archived');
    const version = database.prepare("SELECT event_type FROM project_versions WHERE project_id = ? ORDER BY version_number DESC LIMIT 1").get(project.id) as { event_type: string };
    expect(version.event_type).toBe('project_archived');

    const restored = repository.restore(project.id);
    expect(restored?.status).toBe('draft');
    expect(repository.list()).toHaveLength(1);
    expect(repository.listArchived()).toHaveLength(0);
  });

  it('permanently deletes only the selected project and cascades its saved versions', () => {
    const database = createDatabase(':memory:'); databases.push(database);
    const repository = new ProjectRepository(database);
    const removed = repository.create({ name: 'Remove me', clientName: '', description: '', platform: 'n8n' });
    const retained = repository.create({ name: 'Keep me', clientName: '', description: '', platform: 'make' });

    expect(repository.delete(removed.id)?.id).toBe(removed.id);
    expect(repository.findById(removed.id)).toBeNull();
    expect(repository.findById(retained.id)?.id).toBe(retained.id);
    expect(database.prepare('SELECT COUNT(*) AS count FROM project_versions WHERE project_id = ?').get(removed.id)).toEqual({ count: 0 });
    expect(repository.delete(removed.id)).toBeNull();
  });
});
