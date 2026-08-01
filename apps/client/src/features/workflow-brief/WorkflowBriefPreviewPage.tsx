import { useState, type FormEvent } from 'react';
import { workflowBriefApi, type DraftWorkflowBriefResponse } from '../../api/workflow-brief';

export function WorkflowBriefPreviewPage({
  generateDraft = workflowBriefApi.generateDraft,
}: {
  generateDraft?: typeof workflowBriefApi.generateDraft;
}) {
  const [requirement, setRequirement] = useState('');
  const [result, setResult] = useState<DraftWorkflowBriefResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const trimmed = requirement.trim();

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || loading) return;
    setLoading(true);
    setError('');
    try {
      setResult(await generateDraft(trimmed));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The draft brief could not be generated.');
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setRequirement('');
    setResult(null);
    setError('');
  };

  const brief = result?.brief;
  return (
    <main className="workflow-brief-preview">
      <header className="workflow-brief-preview__header">
        <span>Internal development tool</span>
        <h1>Workflow Brief Preview</h1>
        <p>Generate review-only business-level JSON using the current Router, Binary Decision, Wait, and Approval detectors.</p>
      </header>

      <form className="workflow-brief-preview__form" onSubmit={(event) => void generate(event)}>
        <label htmlFor="workflow-brief-requirement">Raw requirement</label>
        <textarea
          id="workflow-brief-requirement"
          rows={7}
          value={requirement}
          onChange={(event) => setRequirement(event.target.value)}
          placeholder="Example: Route requests to IT, Marketing, or Customer Support."
        />
        {!trimmed && <p className="workflow-brief-preview__validation">Enter a requirement to generate a draft brief.</p>}
        <div className="workflow-brief-preview__actions">
          <button className="button primary" type="submit" disabled={!trimmed || loading}>
            {loading ? 'Generating draft…' : 'Generate Draft Brief'}
          </button>
          <button className="button secondary" type="button" onClick={clear} disabled={loading && !requirement}>Clear</button>
        </div>
      </form>

      {loading && <p className="workflow-brief-preview__state" role="status">Generating and validating the draft brief…</p>}
      {error && <p className="workflow-brief-preview__error" role="alert">{error}</p>}
      {!result && !loading && !error && <section className="workflow-brief-preview__empty"><h2>No draft generated</h2><p>Enter a business requirement above to inspect its draft Workflow Brief.</p></section>}

      {result && brief && <div className="workflow-brief-preview__results">
        <section>
          <h2>Detection Summary</h2>
          <dl className="workflow-brief-preview__metrics">
            <div><dt>Candidate count</dt><dd>{result.detectionSummary.candidateCount}</dd></div>
            <div><dt>Detected functions</dt><dd>{result.detectionSummary.detectedFunctions.join(', ') || 'None'}</dd></div>
            <div><dt>Clarifications</dt><dd>{result.detectionSummary.clarificationCount}</dd></div>
          </dl>
        </section>

        <section>
          <h2>Detected Capabilities</h2>
          {brief.capabilitySuggestions.length === 0
            ? <p>No capabilities detected by the current decision detectors.</p>
            : brief.capabilitySuggestions.map((capability) => {
              const confidence = brief.confidence.find((item) => item.id === capability.confidenceId);
              const review = brief.reviewDecisions.find((item) => item.id === capability.reviewDecisionId);
              const evidence = brief.evidence.filter((item) => capability.evidenceIds.includes(item.id));
              return <article key={capability.id} className="workflow-brief-preview__card">
                <h3>{capability.capabilityType}</h3>
                <p>{capability.description}</p>
                <p><strong>Confidence:</strong> {confidence ? `${confidence.level} (${confidence.score})` : 'Unavailable'}</p>
                <p><strong>Suggested review state:</strong> {review?.state ?? 'Unavailable'}</p>
                <div><strong>Evidence:</strong>{evidence.map((item) => <blockquote key={item.id}>{item.sourceText}<small>{item.explanation}</small></blockquote>)}</div>
              </article>;
            })}
        </section>

        <section>
          <h2>Semantic Routes</h2>
          {brief.decisions.length === 0
            ? <p>No Router or Binary Decision was detected.</p>
            : brief.decisions.map((decision) => <article key={decision.id} className="workflow-brief-preview__card">
              <h3>{decision.name}</h3>
              <p>{decision.description}</p>
              <ul>{decision.routeIds.map((routeId) => {
                const route = brief.routes.find((item) => item.id === routeId);
                return route ? <li key={route.id}><strong>{route.label}</strong><span>{route.condition}</span><small>{route.outcomeDescription}</small></li> : null;
              })}</ul>
            </article>)}
        </section>

        <section>
          <h2>Wait Boundaries</h2>
          {brief.waits.length === 0
            ? <p>No complete Wait boundary was detected.</p>
            : brief.waits.map((wait) => {
              const capability = brief.capabilitySuggestions.find((item) => item.relatedEntityIds.includes(wait.id));
              const confidence = brief.confidence.find((item) => item.id === capability?.confidenceId);
              return <article key={wait.id} className="workflow-brief-preview__card">
                <h3>{wait.name}</h3>
                <p><strong>Wait type:</strong> {wait.waitType}</p>
                <p><strong>Boundary:</strong> {wait.boundaryDescription}</p>
                <p><strong>Resume meaning:</strong> {brief.actions.find((item) => item.id === wait.resumeActionId)?.name ?? 'Requires review'}</p>
                <p><strong>Confidence:</strong> {confidence ? `${confidence.level} (${confidence.score})` : 'Unavailable'}</p>
              </article>;
            })}
        </section>

        <section>
          <h2>Approval Boundaries</h2>
          {brief.approvals.length === 0
            ? <p>No complete Approval boundary was detected. Approval suggestions may still require clarification.</p>
            : brief.approvals.map((approval) => {
              const capability = brief.capabilitySuggestions.find((item) => item.relatedEntityIds.includes(approval.id));
              const confidence = brief.confidence.find((item) => item.id === capability?.confidenceId);
              const approver = brief.actors.find((item) => item.id === approval.approverActorId);
              const approved = brief.routes.find((item) => item.id === approval.approvedRouteId);
              const rejected = brief.routes.find((item) => item.id === approval.rejectedRouteId);
              return <article key={approval.id} className="workflow-brief-preview__card">
                <h3>{approval.name}</h3>
                <p><strong>Approval subject:</strong> {approval.name.replace(/^Approval for\s+/i, '')}</p>
                <p><strong>Approver role:</strong> {approver?.name ?? 'Requires clarification'}</p>
                <p><strong>Outcome hints:</strong> {[approved?.label, rejected?.label].filter(Boolean).join(' / ') || 'Requires clarification'}</p>
                <p><strong>Confidence:</strong> {confidence ? `${confidence.level} (${confidence.score})` : 'Unavailable'}</p>
              </article>;
            })}
        </section>

        <section>
          <h2>Clarification Questions</h2>
          {brief.clarificationQuestions.length === 0
            ? <p>No clarification questions are currently open.</p>
            : brief.clarificationQuestions.map((question) => <article key={question.id} className="workflow-brief-preview__card">
              <h3>{question.question}</h3><p>{question.reason}</p><p><strong>Priority:</strong> {question.priority} · <strong>Status:</strong> {question.status}</p>
            </article>)}
        </section>

        <section>
          <h2>Draft Status</h2>
          <p className="workflow-brief-preview__status">{brief.reviewState.status}</p>
          <h3>Assumptions</h3><ul>{brief.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>Warnings</h3><ul>{brief.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
          <p><strong>Draft scaffolding:</strong> {brief.triggers[0]?.name} · {brief.actions[0]?.name}</p>
        </section>

        <section>
          <details open>
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </section>
      </div>}
    </main>
  );
}
