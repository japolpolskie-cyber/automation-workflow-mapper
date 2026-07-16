import type { WorkflowValidationResult } from '@awm/shared';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Gauge, Lightbulb } from 'lucide-react';
import { useState } from 'react';

const icons = { error: AlertCircle, warning: AlertTriangle, recommendation: Lightbulb } as const;
export function ValidationPanel({ result, onFocusNode }: { result: WorkflowValidationResult; onFocusNode: (domainNodeId: string) => void }) {
  const [open, setOpen] = useState(false);
  const errors = result.issues.filter((issue) => issue.severity === 'error').length;
  const warnings = result.issues.filter((issue) => issue.severity === 'warning').length;
  return <div className={`validation-panel ${open ? 'open' : ''}`}><button className="validation-summary" onClick={() => setOpen((value) => !value)}>{result.valid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<strong>{result.valid ? 'Workflow passes' : `${errors} validation error${errors === 1 ? '' : 's'}`}</strong><span>{warnings} warnings</span><span><Gauge size={13} /> {result.complexity} · {result.complexityScore}/100</span>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>{open && <div className="validation-body"><div className="validation-stats"><span>{result.statistics.nodes} steps</span><span>{result.statistics.applications} apps</span><span>{result.statistics.branches} branches</span><span>{result.usageEstimate} usage</span><span>{result.statistics.configuredPercent}% configured</span></div><div className="validation-list">{result.issues.length ? result.issues.map((issue, index) => { const Icon = icons[issue.severity]; return <button key={`${issue.code}-${issue.nodeId ?? index}`} className={`validation-issue ${issue.severity}`} disabled={!issue.nodeId} onClick={() => issue.nodeId && onFocusNode(issue.nodeId)}><Icon size={14} /><span><strong>{issue.code.replaceAll('_', ' ')}</strong>{issue.message}</span></button>; }) : <div className="validation-empty"><CheckCircle2 size={18} />No deterministic issues found.</div>}</div></div>}</div>;
}
