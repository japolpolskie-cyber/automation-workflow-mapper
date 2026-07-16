import type { WorkflowSlice } from './workflow-product';

export function WorkflowSelector({ workflows, value, onChange }: { workflows: WorkflowSlice[]; value: string; onChange: (id: string) => void }) {
  if (workflows.length <= 1) return null;
  return <nav className="workflow-selector" aria-label="Project workflows">{workflows.map((item, index) => <button key={item.id} className={item.id === value ? 'active' : ''} onClick={() => onChange(item.id)}><span>{index + 1}</span><strong>{item.label}</strong><small>{item.workflow.nodes.length} steps</small></button>)}</nav>;
}
