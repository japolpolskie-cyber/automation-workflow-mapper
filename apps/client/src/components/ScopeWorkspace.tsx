import type { AnalysisProviderStatus, ExtractedDocument, Project, WorkflowAnalysisResult } from '@awm/shared';
import { AlertCircle, ArrowLeft, Bot, Check, File, FileText, GitBranch, Info, KeyRound, Layers3, Lightbulb, LoaderCircle, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { documentApi } from '../api/documents';
import { projectApi } from '../api/projects';
import { PlatformMark } from './PlatformMark';
import { DetectedProcessSummary } from './DetectedProcessSummary';
import { workflowTemplates } from '../data/workflow-templates';

const ACCEPTED = '.txt,.md,.markdown,.pdf,.docx,.csv,.json';
const MAX_SIZE = 10 * 1024 * 1024;

export function ScopeWorkspace({ project, onBack, onSaved, onOpenBuilder }: { project: Project; onBack: () => void; onSaved: (project: Project) => void; onOpenBuilder: (() => void) | undefined }) {
  const [text, setText] = useState(project.originalScope);
  const [document, setDocument] = useState<ExtractedDocument | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisSeconds, setAnalysisSeconds] = useState(0);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'saving' | 'generating' | 'processing' | 'complete'>('idle');
  const [analysis, setAnalysis] = useState<WorkflowAnalysisResult | null>(project.workflow.nodes.length ? { workflow: project.workflow, graphValidation: { valid: true, errorCount: 0, warningCount: 0 }, provider: 'local', analyzedAt: project.updatedAt } : null);
  const [providerStatus, setProviderStatus] = useState<AnalysisProviderStatus | null>(null);
  useEffect(() => {
    let active = true;
    projectApi.analysisStatus().then((status) => { if (active) setProviderStatus(status); }).catch(() => { if (active) setProviderStatus(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!analyzing) return;
    setAnalysisSeconds(0);
    const timer = window.setInterval(() => setAnalysisSeconds((seconds) => seconds + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [analyzing]);
  const picker = useRef<HTMLInputElement>(null);
  const counts = useMemo(() => ({ characters: text.length, words: text.match(/\S+/g)?.length ?? 0 }), [text]);
  const analysisProgress = useMemo(() => {
    if (analysisPhase === 'saving') return { percent: 5, stage: 'Saving and preparing requirements' };
    if (analysisPhase === 'processing') return { percent: 94, stage: 'Validating architecture and saving workflow' };
    if (analysisPhase === 'complete') return { percent: 100, stage: 'Analysis complete' };
    const generated = Math.min(70, Math.round(70 * (1 - Math.exp(-analysisSeconds / 95))));
    const percent = Math.min(82, 12 + generated);
    const stage = analysisSeconds < 8 ? 'Waiting for the local AI model' : analysisSeconds < 75 ? 'AI is designing applications and workflow steps' : analysisSeconds < 180 ? 'AI is developing branches and failure paths' : 'AI is completing the architecture draft';
    return { percent, stage };
  }, [analysisPhase, analysisSeconds]);
  const friendlyError = useMemo(() => {
    if (!error) return null;
    if (/fetch|network|connect/i.test(error)) return { title: 'The analysis service is not available', detail: 'Confirm the local server and your selected AI provider are running, then try again. Your requirements are still here.' };
    if (/timeout|timed out/i.test(error)) return { title: 'Analysis took longer than expected', detail: 'The local model may still be loading. Wait a moment and retry; your requirements have not been lost.' };
    return { title: 'We could not complete that step', detail: error };
  }, [error]);
  const replaceScopeText = (nextText: string) => {
    setText(nextText);
    setDocument(null);
    setSaved(false);
    setError('');
    if (nextText !== text) setAnalysis(null);
  };
  const startNewWorkflow = () => {
    setText('');
    setDocument(null);
    setAnalysis(null);
    setSaved(false);
    setError('');
    setAnalysisPhase('idle');
  };

  const processFile = async (file: File) => {
    setError(''); setSaved(false);
    if (file.size > MAX_SIZE) { setError('The file exceeds the 10 MB upload limit.'); return; }
    setExtracting(true);
    try { const result = await documentApi.extract(file); replaceScopeText(result.text); setDocument(result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The document could not be processed.'); }
    finally { setExtracting(false); }
  };
  const choose = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void processFile(file); event.target.value = ''; };
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void processFile(file); };
  const save = async () => {
    setSaving(true); setError('');
    try { const updated = await projectApi.updateScope(project.id, text); onSaved(updated); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The scope could not be saved.'); }
    finally { setSaving(false); }
  };
  const analyze = async (replaceExisting = false, workflowMode: 'auto' | 'single' = 'auto') => {
    if (replaceExisting) setAnalysis(null);
    setAnalyzing(true); setAnalysisPhase('saving'); setError(''); setSaved(false);
    try {
      await projectApi.updateScope(project.id, text);
      setAnalysisPhase('generating');
      const result = await projectApi.analyze(project.id, workflowMode);
      setAnalysisPhase('processing');
      setAnalysis(result);
      const updated = await projectApi.get(project.id); onSaved(updated); setSaved(true);
      setAnalysisPhase('complete');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Requirements analysis failed.'); }
    finally { setAnalyzing(false); setAnalysisPhase('idle'); }
  };

  return <div className="scope-page">
    <header className="scope-topbar sticky-global-header"><button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Projects</button><div className="scope-title"><PlatformMark platform={project.platform} compact /><div><strong>{project.name}</strong><small>Scope of Work</small></div></div><div className="scope-header-actions">{onOpenBuilder && !analysis && !text.trim() && <button className="button secondary" onClick={onOpenBuilder}>Open blank workflow</button>}<button className="button primary" disabled={saving || !text.trim()} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={17} /> : saved ? <Check size={17} /> : null}{saving ? 'Saving…' : saved ? 'Saved' : 'Save scope'}</button></div></header>
    <main className="scope-content"><section className="scope-intro"><p className="eyebrow"><Sparkles size={14} /> Requirements intake</p><h1>Add your Scope of Work</h1><p>Paste requirements or upload a supported document. Review and edit the extracted text before analysis.</p>
      <div className="sample-requests" aria-label="Example workflow requests"><span><Lightbulb size={14} /> Try an example</span>{workflowTemplates.slice(0, 4).map((template) => <button type="button" key={template.id} onClick={() => replaceScopeText(template.scope)}>{template.name}</button>)}</div>
    </section>
      <div className="scope-layout"><section className="editor-panel"><div className="panel-heading"><div><h2>Requirements</h2><p>Use plain language, process steps, conditions, and expected outcomes.</p></div><button className="text-button danger" disabled={!text} onClick={() => replaceScopeText('')}><Trash2 size={15} /> Clear</button></div>
        <textarea className="scope-editor" aria-label="Scope of Work text" value={text} maxLength={100000} onChange={(event) => replaceScopeText(event.target.value)} placeholder="Example: When a new Facebook Lead Ads submission is received, validate the email address…" />
        <footer className="editor-footer"><span>{counts.words.toLocaleString()} words</span><span>{counts.characters.toLocaleString()} / 100,000 characters</span></footer></section>
        <aside className="upload-panel"><div className="panel-heading"><div><h2>Upload document</h2><p>We extract text locally through the application server.</p></div></div>
          <input ref={picker} type="file" accept={ACCEPTED} hidden onChange={choose} />
          <button className={`drop-zone ${dragging ? 'dragging' : ''}`} disabled={extracting} onClick={() => picker.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
            {extracting ? <><LoaderCircle className="spin upload-icon" size={29} /><strong>Extracting document…</strong><span>Validating and reading content</span></> : <><UploadCloud className="upload-icon" size={29} /><strong>Drop a file here</strong><span>or click to browse</span><small>TXT, MD, PDF, DOCX, CSV, JSON · 10 MB max</small></>}
          </button>
          {document && <article className="uploaded-file"><span className="file-icon"><File size={19} /></span><div><strong>{document.fileName}</strong><small>{(document.size / 1024).toFixed(1)} KB · {document.wordCount.toLocaleString()} words</small></div><button className="icon-button" aria-label="Remove uploaded file" onClick={() => setDocument(null)}><X size={17} /></button></article>}
          {document?.warnings.map((warning) => <div className="warning-note" key={warning}><AlertCircle size={15} />{warning}</div>)}
          <div className="upload-help"><FileText size={18} /><div><strong>Review before analysis</strong><p>Headings and readable lists are retained where the source format allows. Tables may be represented as plain text.</p></div></div>
        </aside></div>
      {friendlyError && <div className="scope-error enhanced-feedback" role="alert"><AlertCircle size={18} /><div><strong>{friendlyError.title}</strong><p>{friendlyError.detail}</p></div></div>}
      {saved && !analyzing && <div className="scope-success" role="status"><Check size={17} /><div><strong>Your progress is saved</strong><p>You can continue editing, analyze the requirements, or return later.</p></div></div>}
      {analyzing && <div className="analysis-progress sticky-workspace-toolbar" role="status"><LoaderCircle className="spin" size={18} /><div className="analysis-progress-content"><div className="analysis-progress-heading"><strong>{analysisProgress.stage}</strong><b>{analysisProgress.percent}%</b></div><div className="analysis-progress-track" aria-label={`Estimated analysis progress ${analysisProgress.percent}%`}><span style={{ width: `${analysisProgress.percent}%` }} /></div><small>Estimated progress · {analysisSeconds}s elapsed. Local AI timing varies, and progress pauses while the model is still generating.</small></div></div>}
      {analysis ? <section className="analysis-results"><div className="draft-plan-notice" role="note"><Info size={18} /><div><strong>Choose how to continue</strong><p>Use the saved workflow, regenerate it from the requirements currently shown above, or start with an empty requirements editor for a different workflow.</p></div></div><header className="sticky-workspace-toolbar"><div><span className="analysis-icon"><Bot size={20} /></span><div><p className="eyebrow">Analysis complete · {analysis.analyzedAt === project.updatedAt ? 'Saved analysis' : analysis.provider === 'local' ? 'Local preview' : analysis.provider === 'ollama' ? 'Free local AI' : 'OpenAI provider'}</p><h2>{analysis.workflow.name}</h2><p>{analysis.workflow.summary || analysis.workflow.objective}</p></div></div><strong>{Math.round((analysis.workflow.confidence ?? 0) * 100)}% confidence</strong></header>
        <div className="analysis-metrics"><article><Layers3 size={17} /><div><strong>{analysis.workflow.nodes.length}</strong><span>Workflow steps</span></div></article><article><GitBranch size={17} /><div><strong>{analysis.workflow.branches.length}</strong><span>Branches</span></div></article><article><KeyRound size={17} /><div><strong>{new Set(analysis.workflow.nodes.flatMap((node) => node.credentials)).size}</strong><span>Credentials</span></div></article><article><Sparkles size={17} /><div><strong className="capitalize">{analysis.workflow.complexity}</strong><span>Complexity</span></div></article></div>
        {analysis.detectedProcess && <DetectedProcessSummary summary={analysis.detectedProcess} />}
        {analysis.workflow.clarificationQuestions.length > 0 && <div className="clarifications"><h3>More information will improve this plan</h3><p>These are business decisions—not technical errors. Add the answers to your requirements, then regenerate the analysis.</p>{analysis.workflow.clarificationQuestions.map((question, index) => <div className="question" key={question.id}><span>{index + 1}</span><div><strong>{question.question}</strong><small>Missing detail · {question.category.replace('_', ' ')}</small></div></div>)}</div>}
        <footer className="sticky-analysis-actions"><span>{analysis.graphValidation.valid ? <Check size={15} /> : <AlertCircle size={15} />} Graph structure validated</span><div className="analysis-actions"><button className="button secondary" disabled={analyzing} onClick={startNewWorkflow}>Start new workflow</button><button className="button secondary" disabled={analyzing || !text.trim()} onClick={() => void analyze(true, 'single')}>{analyzing ? 'Analyzing…' : 'Generate as single workflow'}</button><button className="button secondary" disabled={analyzing || !text.trim()} onClick={() => void analyze(true)}>{analyzing ? 'Analyzing…' : 'Regenerate automatically'}</button>{onOpenBuilder && <button className="button primary" onClick={onOpenBuilder}>Use existing workflow</button>}</div></footer>
      </section> : <section className="analysis-next sticky-workspace-toolbar"><div><span>Next step</span><h3>Analyze requirements</h3><p>Generate a reviewable workflow draft and identify missing business information. One independent trigger produces one workflow; multiple independent triggers may produce separate workflow tabs. Nothing is deployed automatically.{providerStatus ? ` ${providerStatus.message}` : ''}</p></div><div className="analysis-actions"><button className="button secondary" disabled={analyzing || !text.trim() || providerStatus?.available === false} onClick={() => void analyze(false, 'single')}>{analyzing ? 'Analyzing…' : 'Generate as single workflow'}</button><button className="button primary" disabled={analyzing || !text.trim() || providerStatus?.available === false} onClick={() => void analyze()}>{analyzing ? <><LoaderCircle className="spin" size={16} />Analyzing…</> : 'Analyze automatically'}</button></div></section>}
    </main>
  </div>;
}
