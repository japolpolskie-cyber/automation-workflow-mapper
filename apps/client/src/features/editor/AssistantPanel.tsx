import type { Project, WorkflowPatchProposal } from "@awm/shared";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { projectApi } from "../../api/projects";

const examples = [
  "Add an error handler after the selected node",
  "Add a Slack notification when this fails",
  "Add human approval before the selected node",
  "Replace Gmail with Outlook",
  "Add logging for important executions",
];
export function AssistantPanel({
  projectId,
  workflow,
  selectedNodeId,
  onApply,
  onClose,
}: {
  projectId: string;
  workflow: Project["workflow"];
  selectedNodeId: string | null;
  onApply: (proposal: WorkflowPatchProposal) => void;
  onClose: () => void;
}) {
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<WorkflowPatchProposal>();
  const propose = async () => {
    if (!command.trim()) return;
    setBusy(true);
    setError("");
    setProposal(undefined);
    try {
      setProposal(
        await projectApi.assist(projectId, command, workflow, selectedNodeId),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The assistant could not create a proposal.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="assistant-backdrop" role="presentation">
      <section className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
        <header>
          <div>
            <span>
              <Sparkles size={16} />
            </span>
            <div>
                <strong id="assistant-title">Workflow assistant</strong>
              <small>Preview every change before applying</small>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Close assistant"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="assistant-content">
          <label>
            What would you like to change?
            <textarea
              autoFocus
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="Example: Add an error handler after the selected HTTP request."
            />
          </label>
          <div className="assistant-examples">
            {examples.map((example) => (
              <button key={example} onClick={() => setCommand(example)}>
                {example}
              </button>
            ))}
          </div>
          <button
            className="button primary assistant-send"
            disabled={busy || !command.trim()}
            onClick={() => void propose()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Send size={15} />
            )}
            {busy ? "Creating proposal…" : "Propose changes"}
          </button>
          {error && (
            <p className="assistant-error" role="alert">
              <AlertTriangle size={14} />
              {error}
            </p>
          )}
          {proposal && (
            <div className="proposal">
              <div className="proposal-heading">
                <div>
                  <span>Proposed patch</span>
                  <strong>{proposal.summary}</strong>
                </div>
                <small
                  className={proposal.validation.valid ? "valid" : "invalid"}
                >
                  {proposal.validation.errorCount} errors ·{" "}
                  {proposal.validation.warningCount} warnings
                </small>
              </div>
              {proposal.changes.map((change) => (
                <article
                  key={`${change.type}-${change.nodeId}-${change.label}`}
                >
                  <span>{change.type}</span>
                  <div>
                    <strong>{change.label}</strong>
                    <p>{change.detail}</p>
                  </div>
                </article>
              ))}
              {proposal.warnings.map((warning) => (
                <p className="proposal-warning" key={warning}>
                  <AlertTriangle size={12} />
                  {warning}
                </p>
              ))}
              <footer>
                <button
                  className="button secondary"
                  onClick={() => setProposal(undefined)}
                >
                  Reject
                </button>
                <button
                  className="button primary"
                  disabled={!proposal.changes.length}
                  onClick={() => onApply(proposal)}
                >
                  <Check size={15} />
                  Accept changes
                </button>
              </footer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
