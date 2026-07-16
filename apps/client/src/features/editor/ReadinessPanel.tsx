import { AlertTriangle, CheckCircle2, CircleDashed, Gauge, ShieldAlert } from 'lucide-react';
import type { WorkflowReadiness } from './workflow-product';

export function ReadinessBadge({ readiness }: { readiness: WorkflowReadiness }) {
  return <span className={`readiness-badge status-${readiness.status.toLowerCase().replaceAll(' ', '-')}`}>{readiness.status}</span>;
}

export function ReadinessPanel({ readiness }: { readiness: WorkflowReadiness }) {
  const groups = (['high', 'medium', 'low'] as const).map((priority) => ({ priority, items: readiness.items.filter((item) => item.priority === priority) })).filter((group) => group.items.length);
  return <section className="readiness-panel"><header><div><Gauge size={18} /><div><span>Client handoff</span><h2>Build readiness</h2></div></div><ReadinessBadge readiness={readiness} /></header>
    <div className="readiness-summary"><article><CheckCircle2 /><strong>{readiness.completed}</strong><span>Completed</span></article><article><CircleDashed /><strong>{readiness.total - readiness.completed}</strong><span>Manual configuration</span></article><article><ShieldAlert /><strong>{readiness.items.filter((item) => item.priority === 'high').length}</strong><span>Blocking items</span></article><article><Gauge /><strong>{readiness.estimatedEffort}</strong><span>Estimated effort</span></article></div>
    {groups.length ? <div className="readiness-groups">{groups.map((group) => <section key={group.priority}><h3>{group.priority} priority</h3>{group.items.map((item, index) => <p key={`${item.nodeId}-${index}`}><AlertTriangle size={13} />{item.label}</p>)}</section>)}</div> : <div className="readiness-complete"><CheckCircle2 size={18} />All build-readiness checks are complete.</div>}
  </section>;
}
