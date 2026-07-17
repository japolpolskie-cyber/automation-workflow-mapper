import { ArrowRight, LayoutTemplate } from 'lucide-react';
import { workflowTemplates, type WorkflowTemplate } from '../data/workflow-templates';
import { PlatformMark } from './PlatformMark';

export function TemplateGallery({ onSelect, limit }: { onSelect: (template: WorkflowTemplate) => void; limit?: number }) {
  const templates = limit ? workflowTemplates.slice(0, limit) : workflowTemplates;
  return <div className="template-grid">
    {templates.map((template) => <button type="button" className="template-card" key={template.id} onClick={() => onSelect(template)} aria-label={`Use ${template.name} template`}>
      <div className="template-card-head"><span className="template-icon"><LayoutTemplate size={16} /></span><PlatformMark platform={template.platform} compact /></div>
      <div><small>{template.category}</small><h3>{template.name}</h3><p>{template.description}</p></div>
      <span className="template-use">Use template <ArrowRight size={14} /></span>
    </button>)}
  </div>;
}

