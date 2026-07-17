import {
  comparePlatforms,
  generateImplementationChecklist,
  generateImplementationMarkdown,
} from "@awm/platforms";
import type { Platform, Project } from "@awm/shared";
import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, type Node } from "@xyflow/react";
import { jsPDF } from "jspdf";
import {
  CheckCircle2,
  Download,
  FileCode2,
  FileText,
  Image,
  LoaderCircle,
  Scale,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

export const EXPORT_THEME_CLASS = "kaizen-export-surface";

const safeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "workflow";
function saveData(data: string, filename: string, mimeType: string) {
  const link = document.createElement("a");
  link.href = data.startsWith("data:")
    ? data
    : URL.createObjectURL(new Blob([data], { type: mimeType }));
  link.download = filename;
  link.click();
  if (!data.startsWith("data:")) URL.revokeObjectURL(link.href);
}

interface ComparisonExportPanelProps {
  workflow: Project["workflow"];
  workflowSet: Project["workflowSet"];
  selectedWorkflowId: string;
  platform: Platform;
  canvasId: string;
  nodes: Node[];
  onClose: () => void;
}

export function ComparisonExportPanel({
  workflow,
  workflowSet,
  selectedWorkflowId,
  platform,
  canvasId,
  nodes,
  onClose,
}: ComparisonExportPanelProps) {
  const [tab, setTab] = useState<"compare" | "export">("compare");
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const comparison = useMemo(() => comparePlatforms(workflow), [workflow]);
  const name = safeName(workflow.name);
  const exportSurface = () => {
    const element = document
      .getElementById(canvasId)
      ?.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!element) throw new Error("Workflow canvas is not available.");
    const exportNodes = nodes.map((node) => ({
      ...node,
      width: node.measured?.width ?? node.width ?? 250,
      height: node.measured?.height ?? node.height ?? 112,
    }));
    const bounds = getNodesBounds(exportNodes);
    const padding = 80;
    const width = Math.max(900, Math.ceil(bounds.width + padding * 2));
    const height = Math.max(600, Math.ceil(bounds.height + padding * 2));
    return {
      element,
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${padding - bounds.x}px, ${padding - bounds.y}px) scale(1)`,
        transformOrigin: "top left",
      },
    };
  };
  const exportVisual = async (format: "png" | "svg" | "pdf") => {
    setWorking(format);
    setError("");
    let exportElement: HTMLElement | null = null;
    try {
      const surface = exportSurface();
      exportElement = surface.element;
      exportElement.classList.add(EXPORT_THEME_CLASS);
      const options = {
        backgroundColor: "#f4f7f5",
        width: surface.width,
        height: surface.height,
        style: surface.style,
        cacheBust: true,
      };
      if (format === "svg") {
        saveData(
          await toSvg(surface.element, options),
          `${name}-workflow.svg`,
          "image/svg+xml",
        );
      } else {
        const png = await toPng(surface.element, { ...options, pixelRatio: 2 });
        if (format === "png")
          saveData(png, `${name}-workflow.png`, "image/png");
        else {
          const pdf = new jsPDF({
            orientation: "landscape",
            unit: "pt",
            format: "a4",
          });
          const width = pdf.internal.pageSize.getWidth();
          const height = pdf.internal.pageSize.getHeight();
          pdf.setFontSize(9);
          pdf.text(
            "Draft export — review required before platform implementation.",
            24,
            20,
          );
          pdf.addImage(
            png,
            "PNG",
            24,
            30,
            width - 48,
            height - 54,
            undefined,
            "FAST",
          );
          pdf.save(`${name}-workflow.pdf`);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      exportElement?.classList.remove(EXPORT_THEME_CLASS);
      setWorking("");
    }
  };

  return (
    <div className="assistant-backdrop" role="presentation">
      <section className="compare-export-panel" role="dialog" aria-modal="true" aria-labelledby="comparison-title">
        <header>
          <div>
            <span>
              <Scale size={17} />
            </span>
            <div>
                <strong id="comparison-title">Compare and export</strong>
              <small>Platform fit and implementation handoff</small>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Close comparison"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <nav>
          <button
            className={tab === "compare" ? "active" : ""}
            onClick={() => setTab("compare")}
          >
            Platform comparison
          </button>
          <button
            className={tab === "export" ? "active" : ""}
            onClick={() => setTab("export")}
          >
            Exports
          </button>
        </nav>
        <div className="compare-export-content">
          {tab === "compare" ? (
            <>
              <div className="recommended-platform">
                <CheckCircle2 size={18} />
                <div>
                  <span>Recommended platform</span>
                  <strong>
                    {
                      comparison.entries.find(
                        (entry) =>
                          entry.platform === comparison.recommendedPlatform,
                      )?.platformName
                    }
                  </strong>
                  <p>{comparison.recommendationReasons[0]}</p>
                </div>
              </div>
              <div className="comparison-grid">
                {comparison.entries.map((entry) => (
                  <article
                    className={
                      entry.platform === comparison.recommendedPlatform
                        ? "recommended"
                        : ""
                    }
                    key={entry.platform}
                  >
                    <header>
                      <strong>{entry.platformName}</strong>
                      <span>{entry.score}/100</span>
                    </header>
                    <dl>
                      <div>
                        <dt>Steps</dt>
                        <dd>{entry.steps}</dd>
                      </div>
                      <div>
                        <dt>Branches</dt>
                        <dd>{entry.branches}</dd>
                      </div>
                      <div>
                        <dt>Complexity</dt>
                        <dd>{entry.complexity}</dd>
                      </div>
                      <div>
                        <dt>Usage</dt>
                        <dd>{entry.usage}</dd>
                      </div>
                      <div>
                        <dt>Maintainability</dt>
                        <dd>{entry.maintainability}</dd>
                      </div>
                      <div>
                        <dt>Flexibility</dt>
                        <dd>{entry.flexibility}</dd>
                      </div>
                      <div>
                        <dt>Skill required</dt>
                        <dd>{entry.skillRequired}</dd>
                      </div>
                      <div>
                        <dt>Validation</dt>
                        <dd>
                          {entry.validationErrors} errors ·{" "}
                          {entry.validationWarnings} warnings
                        </dd>
                      </div>
                    </dl>
                    {entry.reasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="export-notice">
                All exports are planning drafts and require review before
                platform implementation or import.
              </p>
              <div className="export-grid">
                <button
                  onClick={() =>
                    saveData(
                      JSON.stringify(
                        {
                          label:
                            "Draft export — review required before platform import",
                          selectedWorkflowId,
                          workflowSet,
                          workflow,
                        },
                        null,
                        2,
                      ),
                      `${name}-workflow.json`,
                      "application/json",
                    )
                  }
                >
                  <FileCode2 />
                  <strong>Workflow JSON</strong>
                  <span>
                    Canonical workflow, workflow set, and planning metadata
                  </span>
                </button>
                <button
                  onClick={() =>
                    saveData(
                      generateImplementationMarkdown(workflow, platform),
                      `${name}-implementation.md`,
                      "text/markdown",
                    )
                  }
                >
                  <FileText />
                  <strong>Technical handoff</strong>
                  <span>
                    Steps, mappings, credentials, testing, and deployment
                  </span>
                </button>
                <button
                  onClick={() =>
                    saveData(
                      generateImplementationChecklist(workflow, platform),
                      `${name}-checklist.md`,
                      "text/markdown",
                    )
                  }
                >
                  <CheckCircle2 />
                  <strong>Implementation checklist</strong>
                  <span>Actionable setup and testing tasks</span>
                </button>
                <button
                  disabled={Boolean(working)}
                  onClick={() => void exportVisual("png")}
                >
                  <Image />
                  <strong>Canvas PNG</strong>
                  <span>High-resolution workflow image</span>
                </button>
                <button
                  disabled={Boolean(working)}
                  onClick={() => void exportVisual("svg")}
                >
                  <Image />
                  <strong>Canvas SVG</strong>
                  <span>Scalable workflow illustration</span>
                </button>
                <button
                  disabled={Boolean(working)}
                  onClick={() => void exportVisual("pdf")}
                >
                  <Download />
                  <strong>Canvas PDF</strong>
                  <span>Landscape visual handoff</span>
                </button>
              </div>
              {working && (
            <p className="export-working" role="status">
                  <LoaderCircle className="spin" size={14} />
                  Preparing {working.toUpperCase()} export…
                </p>
              )}
          {error && <p className="assistant-error" role="alert">{error}</p>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
