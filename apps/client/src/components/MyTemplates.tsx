import type { CustomWorkflowTemplate } from "@awm/shared";
import { ArrowRight, FilePenLine, LayoutTemplate, Trash2 } from "lucide-react";
import { PlatformMark } from "./PlatformMark";

export function MyTemplates({
  templates,
  busyId,
  onUse,
  onEdit,
  onDelete,
}: {
  templates: CustomWorkflowTemplate[];
  busyId: string | null;
  onUse: (template: CustomWorkflowTemplate) => void;
  onEdit: (template: CustomWorkflowTemplate) => void;
  onDelete: (template: CustomWorkflowTemplate) => void;
}) {
  if (!templates.length)
    return (
      <div className="my-templates-empty">
        <LayoutTemplate size={20} />
        <div>
          <strong>No personal templates yet</strong>
          <p>
            Open a workflow in the builder and choose Save as custom template.
          </p>
        </div>
      </div>
    );
  return (
    <div className="template-grid custom-template-grid">
      {templates.map((template) => (
        <article
          className="template-card custom-template-card"
          key={template.id}
        >
          <div className="template-card-head">
            <span className="template-icon">
              <LayoutTemplate size={16} />
            </span>
            <PlatformMark platform={template.snapshot.platform} compact />
          </div>
          <div>
            <small>{template.category || "Personal"}</small>
            <h3>{template.name}</h3>
            <p>
              {template.description ||
                template.snapshot.workflow.summary ||
                "Personal workflow template"}
            </p>
          </div>
          {template.tags.length > 0 && (
            <div className="template-tags" aria-label="Template labels">
              {template.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
          <div className="custom-template-actions">
            <button
              type="button"
              className="button secondary compact"
              disabled={busyId === template.id}
              onClick={() => onUse(template)}
            >
              Use template <ArrowRight size={14} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => onEdit(template)}
              aria-label={`Edit ${template.name} template details`}
            >
              <FilePenLine size={15} />
            </button>
            <button
              type="button"
              className="icon-button danger"
              onClick={() => onDelete(template)}
              aria-label={`Delete ${template.name} template`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
