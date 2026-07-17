import type {
  CustomTemplateMetadata,
  CustomTemplateSnapshot,
  CustomWorkflowTemplate,
} from "@awm/shared";
import { LoaderCircle, Save, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

interface Props {
  open: boolean;
  busy: boolean;
  snapshot?: CustomTemplateSnapshot | undefined;
  template?: CustomWorkflowTemplate | undefined;
  onClose: () => void;
  onSave: (
    metadata: CustomTemplateMetadata,
    snapshot?: CustomTemplateSnapshot,
  ) => Promise<void>;
}

export function CustomTemplateDialog({
  open,
  busy,
  snapshot,
  template,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? snapshot?.workflow.name ?? "");
    setDescription(template?.description ?? snapshot?.workflow.summary ?? "");
    setCategory(template?.category ?? "");
    setTags(template?.tags.join(", ") ?? "");
    setError("");
  }, [open, template, snapshot]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, busy, onClose]);

  if (!open) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a template name.");
      return;
    }
    setError("");
    try {
      await onSave(
        {
          name: name.trim(),
          description: description.trim(),
          category: category.trim(),
          tags: [
            ...new Set(
              tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            ),
          ],
        },
        snapshot,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The custom template could not be saved.",
      );
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && onClose()
      }
    >
      <section
        className="dialog custom-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-template-title"
      >
        <div className="dialog-head">
          <div>
            <small>{template ? "Template details" : "Personal template"}</small>
            <h2 id="custom-template-title">
              {template ? "Edit template details" : "Save as custom template"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <p className="dialog-context">
            {template
              ? "Update the template name and organization details. The saved workflow will not change."
              : "Save a reusable snapshot of the workflow currently open in the builder."}
          </p>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <label>
            Template name <span aria-hidden="true">*</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label>
            Description{" "}
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              rows={3}
            />
          </label>
          <label>
            Category{" "}
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              maxLength={120}
              placeholder="e.g. Sales"
            />
          </label>
          <label>
            Labels / tags{" "}
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="crm, follow-up"
              aria-describedby="custom-template-tags-help"
            />
          </label>
          <small id="custom-template-tags-help">
            Separate labels with commas.
          </small>
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Save size={16} />
              )}
              {busy ? "Saving…" : "Save template"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
