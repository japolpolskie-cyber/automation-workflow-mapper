import {
  processAnalysisDiagnosticsSchema,
  processClarificationRecommendationsSchema,
} from '@awm/shared';
import { AlertTriangle, CheckCircle2, ChevronRight, CircleHelp, Gauge } from 'lucide-react';

export function ClarificationReviewPanel({
  diagnostics,
  recommendations,
}: {
  diagnostics: unknown;
  recommendations: unknown;
}) {
  const parsedDiagnostics = processAnalysisDiagnosticsSchema.safeParse(diagnostics);
  if (!parsedDiagnostics.success) return null;
  const parsedRecommendations = processClarificationRecommendationsSchema.safeParse(recommendations);
  const items = parsedRecommendations.success ? parsedRecommendations.data : [];
  const requiredCount = items.filter((item) => item.importance === 'required').length;
  const required = requiredCount > 0;
  const summary = parsedDiagnostics.data.summary;

  return <section className={`clarification-review ${required ? 'required' : ''}`} aria-label="Clarification Review">
    <details open={required || undefined}>
      <summary>
        <span className="clarification-review-icon">
          {required ? <AlertTriangle size={18} /> : <CircleHelp size={18} />}
        </span>
        <span>
          <strong>Clarification Review</strong>
          <small>
            {required
              ? `${requiredCount} required detail${requiredCount === 1 ? '' : 's'} should be reviewed`
              : items.length
                ? `${items.length} advisory recommendation${items.length === 1 ? '' : 's'}`
                : 'No clarification is currently needed'}
          </small>
        </span>
        <ChevronRight className="clarification-review-chevron" size={18} />
      </summary>

      <div className="clarification-review-body">
        <div className="clarification-scores" aria-label="Process analysis confidence and coverage">
          <article><Gauge size={16} /><span>Confidence</span><strong>{summary.confidence.score}%</strong><small>{summary.confidence.level}</small></article>
          <article><Gauge size={16} /><span>Coverage</span><strong>{summary.coverage.score}%</strong><small>{summary.coverage.level}</small></article>
        </div>

        {parsedDiagnostics.data.missingInformation.length > 0 && <div className="clarification-missing">
          <strong>Missing-information summary</strong>
          <ul>{parsedDiagnostics.data.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>}

        {items.length > 0 ? <div className="clarification-recommendation-list">
          {items.map((item) => <article key={item.id}>
            <header><span className={`clarification-importance ${item.importance}`}>{item.importance}</span><span>{item.category.replaceAll('-', ' ')}</span></header>
            <strong>{item.question}</strong>
            <p>{item.reason}</p>
            <small>Suggested answer: {item.suggestedAnswerType.replaceAll('-', ' ')}</small>
          </article>)}
        </div> : <div className="clarification-empty">
          <CheckCircle2 size={18} />
          <div><strong>No clarification needed</strong><p>The available process details are sufficient for review.</p></div>
        </div>}
      </div>
    </details>
  </section>;
}
