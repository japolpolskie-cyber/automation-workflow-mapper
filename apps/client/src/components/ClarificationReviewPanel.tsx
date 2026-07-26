import {
  processAnalysisDiagnosticsSchema,
  processClarificationRecommendationsSchema,
  type ProcessClarificationRecommendation,
} from '@awm/shared';
import { AlertTriangle, CheckCircle2, ChevronRight, CircleHelp, Gauge } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  isDurationAnswer,
  normalizeClarificationAnswers,
  type DurationAnswer,
  type LocalClarificationAnswer,
  type LocalClarificationAnswers,
} from './clarification-answer-state';

export function ClarificationReviewPanel({
  diagnostics,
  recommendations,
  analysisKey = 'current-analysis',
  onAnswersChange,
}: {
  diagnostics: unknown;
  recommendations: unknown;
  analysisKey?: string;
  onAnswersChange?: (answers: ReturnType<typeof normalizeClarificationAnswers>) => void;
}) {
  const [answers, setAnswers] = useState<LocalClarificationAnswers>({});
  useEffect(() => {
    setAnswers({});
    onAnswersChange?.([]);
  }, [analysisKey, onAnswersChange]);

  const parsedDiagnostics = processAnalysisDiagnosticsSchema.safeParse(diagnostics);
  if (!parsedDiagnostics.success) return null;
  const parsedRecommendations = processClarificationRecommendationsSchema.safeParse(recommendations);
  const items = parsedRecommendations.success ? parsedRecommendations.data : [];
  const requiredCount = items.filter((item) => item.importance === 'required').length;
  const required = requiredCount > 0;
  const summary = parsedDiagnostics.data.summary;
  const answeredCount = items.filter((item) => isAnswered(answers[item.id])).length;
  const update = (id: string, answer: LocalClarificationAnswer) => {
    const next = { ...answers, [id]: answer };
    setAnswers(next);
    onAnswersChange?.(normalizeClarificationAnswers(items, next));
  };
  const clear = (id: string) => {
    const next = { ...answers };
    delete next[id];
    setAnswers(next);
    onAnswersChange?.(normalizeClarificationAnswers(items, next));
  };
  const clearAll = () => {
    setAnswers({});
    onAnswersChange?.([]);
  };

  return <section className={`clarification-review ${required ? 'required' : ''}`} aria-label="Clarification Review">
    <details {...(required ? { open: true } : {})}>
      <summary>
        <span className="clarification-review-icon">{required ? <AlertTriangle size={18} /> : <CircleHelp size={18} />}</span>
        <span>
          <strong>Clarification Review</strong>
          <small>{required ? `${requiredCount} required detail${requiredCount === 1 ? '' : 's'} should be reviewed` : items.length ? `${items.length} advisory recommendation${items.length === 1 ? '' : 's'}` : 'No clarification is currently needed'}</small>
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

        {items.length > 0 ? <>
          <div className="clarification-answer-summary" role="status">
            <span><strong>{answeredCount}</strong> of <strong>{items.length}</strong> answered locally</span>
            <button type="button" className="text-button" disabled={answeredCount === 0} onClick={clearAll}>Clear all answers</button>
          </div>
          <div className="clarification-recommendation-list">
            {items.map((item) => {
              const answered = isAnswered(answers[item.id]);
              return <article key={item.id}>
                <header>
                  <span className={`clarification-importance ${item.importance}`}>{item.importance}</span>
                  <span>{item.category.replaceAll('-', ' ')}</span>
                  <span className={`clarification-answer-status ${answered ? 'answered' : 'unanswered'}`}>{answered ? 'Answered' : 'Unanswered'}</span>
                </header>
                <strong>{item.question}</strong>
                <p>{item.reason}</p>
                <small>Suggested answer: {item.suggestedAnswerType.replaceAll('-', ' ')}</small>
                <AnswerControl item={item} answer={answers[item.id]} onChange={(answer) => update(item.id, answer)} />
                <button type="button" className="text-button clarification-clear-answer" disabled={!answered} onClick={() => clear(item.id)}>Clear answer</button>
              </article>;
            })}
          </div>
        </> : <div className="clarification-empty">
          <CheckCircle2 size={18} />
          <div><strong>No clarification needed</strong><p>The available process details are sufficient for review.</p></div>
        </div>}
      </div>
    </details>
  </section>;
}

function AnswerControl({
  item,
  answer,
  onChange,
}: {
  item: ProcessClarificationRecommendation;
  answer: LocalClarificationAnswer | undefined;
  onChange: (answer: LocalClarificationAnswer) => void;
}) {
  const label = `Answer: ${item.question}`;
  if (item.suggestedAnswerType === 'boolean') {
    return <div className="clarification-boolean" role="group" aria-label={label}>
      {[{ label: 'Yes', value: true }, { label: 'No', value: false }].map((option) => <button key={option.label} type="button" aria-pressed={answer === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>;
  }
  if (item.suggestedAnswerType === 'duration') {
    const duration = isDurationAnswer(answer) ? answer : { value: '', unit: 'hours' as const };
    return <div className="clarification-duration">
      <input aria-label={`${label} value`} type="number" min="0" value={duration.value} onChange={(event) => onChange({ ...duration, value: event.target.value })} />
      <select aria-label={`${label} unit`} value={duration.unit} onChange={(event) => onChange({ ...duration, unit: event.target.value as DurationAnswer['unit'] })}>
        <option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option><option value="weeks">Weeks</option>
      </select>
    </div>;
  }
  if (item.suggestedAnswerType === 'single-choice' && item.options?.length) {
    return <select className="clarification-answer-control" aria-label={label} value={typeof answer === 'string' ? answer : ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select an option</option>{item.options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>;
  }
  if (item.suggestedAnswerType === 'multi-choice' && item.options?.length) {
    const selected = Array.isArray(answer) ? answer : [];
    return <fieldset className="clarification-multi-choice"><legend>{label}</legend>{item.options.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((value) => value !== option))} />{option}</label>)}</fieldset>;
  }
  return <input
    className="clarification-answer-control"
    aria-label={label}
    type="text"
    value={typeof answer === 'string' ? answer : ''}
    placeholder={item.suggestedAnswerType === 'application' ? 'Application or system' : item.suggestedAnswerType === 'actor' ? 'Person, role, or team' : 'Enter an answer'}
    onChange={(event) => onChange(event.target.value)}
  />;
}

function isAnswered(answer: LocalClarificationAnswer | undefined): boolean {
  if (typeof answer === 'boolean') return true;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return isDurationAnswer(answer) && answer.value.trim().length > 0;
}
