import type { DetectedProcessFact, DetectedProcessSummary as Summary, DeterministicEvidence } from '@awm/shared';
import { AlertCircle, Braces, CheckCircle2, ChevronRight, GitBranch, Layers3, SearchCheck } from 'lucide-react';

const labels: Record<DetectedProcessFact['kind'], string> = {
  application: 'Applications', entity: 'Entities', business_verb: 'Business actions', decision: 'Decisions',
  route: 'Routes', repetition: 'Repeated work', cardinality: 'Entity cardinality', pattern: 'Matched patterns',
  workflow_function: 'Workflow functions', uncertainty: 'Uncertainties',
};
const percent = (value: number) => `${Math.round(value * 100)}%`;

function EvidenceRow({ item }: { item: DeterministicEvidence }) {
  const location = item.sourceLocation.start === null ? 'missing information' : `scope characters ${item.sourceLocation.start}-${item.sourceLocation.end}`;
  return <li className={`process-evidence ${item.relationship}`}><div><strong>{item.evidenceType.replace('_', ' ')}</strong><span>{percent(item.confidence)} · weight {item.weight}</span></div><q>{item.evidenceText}</q><p>{item.explanation}</p><small>{item.ruleId} · v{item.ruleVersion} · {location}</small></li>;
}

export function DetectedProcessSummary({ summary }: { summary: Summary }) {
  const grouped = summary.facts.reduce<Partial<Record<DetectedProcessFact['kind'], DetectedProcessFact[]>>>((result, item) => { (result[item.kind] ??= []).push(item); return result; }, {});
  const groups = Object.entries(grouped) as [DetectedProcessFact['kind'], DetectedProcessFact[]][];
  return <section className="detected-process" aria-label="Detected Process Summary">
    <header className="sticky-nested-toolbar"><div><span className="process-summary-icon"><SearchCheck size={20} /></span><div><p className="eyebrow">Deterministic scope intelligence · shadow mode</p><h3>Detected Process Summary</h3><p>Inspect why each requirement was detected. This metadata does not modify the generated workflow.</p></div></div><span className="knowledge-budget">{summary.knowledgeContext.estimatedCharacters.toLocaleString()} / {summary.knowledgeContext.maximumCharacters.toLocaleString()} knowledge characters</span></header>
    {summary.reliability && <div className="process-reliability" aria-label="Workflow intelligence reliability"><div><span>Fact confidence</span><strong>{percent(summary.reliability.confidence)}</strong><small>Correctness of detected facts</small></div><div><span>Coverage</span><strong>{percent(summary.reliability.coverage)}</strong><small>Completeness of expected facts</small></div><div><span>Overall reliability</span><strong>{percent(summary.reliability.overall)}</strong><small>Confidence × coverage</small></div></div>}
    <div className="process-groups">{groups.map(([kind, facts]) => <article key={kind}><h4>{kind === 'decision' ? <GitBranch size={16} /> : kind === 'pattern' ? <Layers3 size={16} /> : <Braces size={16} />}{labels[kind]}</h4>{facts.map((item) => <details key={item.id} className="process-fact"><summary><ChevronRight size={15} /><span>{item.value}</span><b>{percent(item.confidence.finalConfidence)}</b></summary><div className="process-fact-body"><p>{item.explanation}</p>{item.subject?.entityId && <p className="fact-subject">Applies to: {item.subject.entityId}</p>}<div className="confidence-formula"><strong>Reproducible score</strong><code>{item.confidence.formula}</code><span>Support {item.confidence.weightedSupport} · Conflict {item.confidence.weightedConflict} · Completeness penalty {percent(item.confidence.completenessPenalty)}</span></div><ul>{item.evidence.map((evidence) => <EvidenceRow key={evidence.id} item={evidence} />)}</ul></div></details>)}</article>)}</div>
    {summary.clarifications.length > 0 && <div className="process-clarifications"><h4><AlertCircle size={17} /> Clarification requirements</h4>{summary.clarifications.map((item) => <details key={item.id}><summary><ChevronRight size={15} /><span>{item.question}</span><b>{percent(item.confidence.finalConfidence)}</b></summary><div><p>{item.reason}</p><p className="assumption"><CheckCircle2 size={14} />{item.assumptionNotMade}</p><ul>{item.evidence.map((evidence) => <EvidenceRow key={evidence.id} item={evidence} />)}</ul></div></details>)}</div>}
  </section>;
}
