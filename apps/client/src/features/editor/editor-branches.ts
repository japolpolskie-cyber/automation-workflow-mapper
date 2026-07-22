import type { Platform, WorkflowNode } from '@awm/shared';

export const MAX_DYNAMIC_BRANCHES = 20;

export interface EditorBranch {
  id: string;
  label: string;
  order: number;
}

export type BranchControl = 'dynamic' | 'fixed-binary' | 'fixed-control';

export const readEditorBranches = (node: WorkflowNode): EditorBranch[] => {
  const value = node.configuration.editorBranches;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Record<string, unknown>;
    return typeof candidate.id === 'string' && typeof candidate.label === 'string' && typeof candidate.order === 'number'
      ? [{ id: candidate.id, label: candidate.label, order: candidate.order }]
      : [];
  }).sort((left, right) => left.order - right.order);
};

export const branchControlFor = (node: WorkflowNode): BranchControl | null => {
  const configured = node.configuration.editorBranchControl;
  if (configured === 'dynamic' || configured === 'fixed-binary' || configured === 'fixed-control') return configured;
  if (node.category === 'condition') return 'fixed-binary';
  if (node.category === 'router' || node.category === 'split' || node.configuration.dynamicConnections === true) return 'dynamic';
  if (['human_approval', 'retry'].includes(node.category)) return 'fixed-control';
  return null;
};

export const branchNounFor = (platform: Platform) => platform === 'zapier' ? 'Path' : platform === 'make' ? 'Route' : 'Output';

export const createEditorBranch = (platform: Platform, order: number): EditorBranch => ({
  id: `branch-${crypto.randomUUID()}`,
  label: `${branchNounFor(platform)} ${order + 1}`,
  order,
});

export const writeEditorBranches = (node: WorkflowNode, branches: EditorBranch[]): WorkflowNode['configuration'] => ({
  ...node.configuration,
  editorBranches: branches.map((branch, order) => ({ ...branch, order })),
});
