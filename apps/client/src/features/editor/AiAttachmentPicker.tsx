import type { AiAttachmentType } from '@awm/shared';
import { BrainCircuit, DatabaseZap, Wrench, X } from 'lucide-react';
import { aiAttachmentLabel, aiAttachmentOptions, type AiAttachmentOption } from './ai-attachment-options';

export function AiAttachmentPicker({ type, onSelect, onClose }: { type: AiAttachmentType; onSelect: (option: AiAttachmentOption) => void; onClose: () => void }) {
  const Icon = type === 'chat-model' ? BrainCircuit : type === 'memory' ? DatabaseZap : Wrench;
  return <div className="ai-attachment-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="ai-attachment-picker" role="dialog" aria-modal="true" aria-labelledby="ai-attachment-picker-title">
      <header><div><small>n8n AI Agent</small><h2 id="ai-attachment-picker-title">Add {aiAttachmentLabel(type)}</h2></div><button className="icon-button" aria-label="Close attachment picker" onClick={onClose}><X size={18} /></button></header>
      <div className="ai-attachment-picker-list">{aiAttachmentOptions[type].map((option) => <button key={option.id} onClick={() => onSelect(option)}><span><Icon size={17} /></span><div><strong>{option.title}</strong><small>{option.summary}</small></div></button>)}</div>
    </section>
  </div>;
}
