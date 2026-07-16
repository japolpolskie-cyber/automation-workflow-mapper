import { BriefcaseBusiness, FileCheck2, FileText, Workflow } from 'lucide-react';

export type WorkflowView = 'business' | 'automation' | 'implementation' | 'handoff';
export function WorkflowViewSwitcher({ value, onChange }: { value: WorkflowView; onChange: (value: WorkflowView) => void }) {
  return <div className="workflow-view-switcher" aria-label="Workflow view"><button className={value === 'business' ? 'active' : ''} onClick={() => onChange('business')}><BriefcaseBusiness size={14} />Business</button><button className={value === 'automation' ? 'active' : ''} onClick={() => onChange('automation')}><Workflow size={14} />Automation</button><button className={value === 'implementation' ? 'active' : ''} onClick={() => onChange('implementation')}><FileText size={14} />Developer</button><button className={value === 'handoff' ? 'active' : ''} onClick={() => onChange('handoff')}><FileCheck2 size={14} />Handoff</button></div>;
}
