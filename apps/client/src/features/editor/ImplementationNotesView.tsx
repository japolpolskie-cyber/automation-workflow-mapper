import type { CanonicalWorkflow, PlatformBuildPlan } from '@awm/shared';
import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react';

export function ImplementationNotesView({ workflow, plan }: { workflow: CanonicalWorkflow; plan?: PlatformBuildPlan }) {
  return <section className="workflow-document-view implementation-notes-view"><header><span>Layer 3</span><h2>Developer view</h2><p>Application, operation, limitations, connections, and implementation guidance without secrets.</p></header><div className="implementation-grid">{workflow.nodes.map((node, index) => {
    const recommendation = plan?.nodes.find((item) => item.sourceNodeId === node.id);
    return <article key={node.id}><header><span>{index + 1}</span><div><strong>{node.name}</strong><small>{recommendation?.appName || node.service || 'Workflow'} · {recommendation?.event || node.operation || node.category.replace('_', ' ')}</small></div></header>
      {recommendation && <div className="developer-badges"><span>{plan?.platformName}</span><span>{recommendation.limitations.length ? 'Workaround' : 'Native'}</span>{recommendation.limitations.length ? <span className="limited">Platform limitation</span> : <span className="supported">Supported</span>}</div>}
      <p>{node.purpose || node.description}</p><dl><div><dt>Recommended node</dt><dd>{recommendation?.stepType || node.service || node.category.replace('_', ' ')}</dd></div><div><dt>Expected result</dt><dd>{node.expectedResult}</dd></div><div><dt><Clock3 size={12} /> Estimated execution</dt><dd>{node.estimatedExecution}</dd></div></dl>
      {recommendation?.limitations.map((item) => <p className="developer-limitation" key={item}><AlertTriangle size={12} />{item}</p>)}
      {recommendation?.requiredCredentials.length ? <section><h4><ShieldCheck size={13} /> Connections</h4>{recommendation.requiredCredentials.map((item) => <p key={item}>{item}</p>)}</section> : null}
      {node.bestPractices.length > 0 && <section><h4><CheckCircle2 size={13} /> Best practices</h4>{node.bestPractices.map((item) => <p key={item}>{item}</p>)}</section>}
      {node.potentialErrors.length > 0 && <section><h4><AlertTriangle size={13} /> Potential errors</h4>{node.potentialErrors.map((item) => <p key={item}>{item}</p>)}</section>}
      {node.alternativeImplementations.length > 0 && <section><h4>Alternative implementations</h4>{node.alternativeImplementations.map((item) => <p key={item}>{item}</p>)}</section>}
      {node.securityNotes.length > 0 && <section><h4><ShieldCheck size={13} /> Security</h4>{node.securityNotes.map((item) => <p key={item}>{item}</p>)}</section>}
    </article>;
  })}</div></section>;
}
