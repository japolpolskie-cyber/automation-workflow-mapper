import type { CreateProjectInput, Platform } from '@awm/shared';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useEffect } from 'react';
import type { WorkflowTemplate } from '../data/workflow-templates';
import { PlatformMark } from './PlatformMark';

export function NewProjectDialog({ open, busy, template, onClose, onCreate }: { open: boolean; busy: boolean; template?: WorkflowTemplate | null; onClose: () => void; onCreate: (input: CreateProjectInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<Platform>('n8n');
  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setClientName('');
    setDescription(template?.description ?? '');
    setPlatform(template?.platform ?? 'n8n');
  }, [open, template]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, busy, onClose]);
  if (!open) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onCreate({ name: name.trim(), clientName: clientName.trim(), description: description.trim(), platform });
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-head"><div><p className="eyebrow">{template ? 'Start from a template' : 'New architecture'}</p><h2 id="dialog-title">Create workflow project</h2>{template && <p className="dialog-context">{template.name} will pre-fill the requirements editor.</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        <label>Project name<input autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Lead qualification pipeline" /></label>
        <label>Client name <span>optional</span><input maxLength={160} value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Acme Inc." /></label>
        <label>Description <span>optional</span><textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short note about the business outcome" /></label>
        <fieldset><legend>Target platform</legend><div className="platform-choice-row">{(['zapier', 'make', 'n8n'] as const).map((item) => <button type="button" key={item} className={platform === item ? 'platform-choice selected' : 'platform-choice'} aria-pressed={platform === item} onClick={() => setPlatform(item)}><PlatformMark platform={item} /></button>)}</div></fieldset>
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create project'}</button></div>
      </form>
    </section>
  </div>;
}
