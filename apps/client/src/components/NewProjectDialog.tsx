import type { CreateProjectInput, Platform } from '@awm/shared';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PlatformMark } from './PlatformMark';

export function NewProjectDialog({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (input: CreateProjectInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<Platform>('n8n');
  if (!open) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onCreate({ name: name.trim(), clientName: clientName.trim(), description: description.trim(), platform });
  };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-head"><div><p className="eyebrow">New architecture</p><h2 id="dialog-title">Create workflow project</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        <label>Project name<input autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Lead qualification pipeline" /></label>
        <label>Client name <span>optional</span><input maxLength={160} value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Acme Inc." /></label>
        <label>Description <span>optional</span><textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short note about the business outcome" /></label>
        <fieldset><legend>Target platform</legend><div className="platform-choice-row">{(['zapier', 'make', 'n8n'] as const).map((item) => <button type="button" key={item} className={platform === item ? 'platform-choice selected' : 'platform-choice'} onClick={() => setPlatform(item)}><PlatformMark platform={item} /></button>)}</div></fieldset>
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create project'}</button></div>
      </form>
    </section>
  </div>;
}
