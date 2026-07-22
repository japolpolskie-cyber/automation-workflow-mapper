import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type EdgeMouseHandler,
  type OnReconnect,
  type ReactFlowInstance,
  type NodeMouseHandler,
} from "@xyflow/react";
import {
  normalizeWorkflowSet,
  validateWorkflow,
  type CustomTemplateMetadata,
  type CustomTemplateSnapshot,
  type CustomWorkflowTemplate,
  type Platform,
  type PlatformBuildPlan,
  type Project,
} from "@awm/shared";
import { buildPlatformPlan } from "@awm/platforms";
import {
  ArrowLeft,
  Check,
  Download,
  LayoutDashboard,
  LayoutTemplate,
  LoaderCircle,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  Workflow,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { customTemplateApi, projectApi } from "../../api/projects";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { CustomTemplateDialog } from "../../components/CustomTemplateDialog";
import { PlatformMark } from "../../components/PlatformMark";
import { AssistantPanel } from "./AssistantPanel";
import { BusinessFlowView } from "./BusinessFlowView";
import { NodeConfigurationPanel } from "./NodeConfigurationPanel";
import { ImplementationNotesView } from "./ImplementationNotesView";
import { ValidationPanel } from "./ValidationPanel";
import { WorkflowCanvasNode } from "./WorkflowCanvasNode";
import {
  WorkflowViewSwitcher,
  type WorkflowView,
} from "./WorkflowViewSwitcher";
import { WorkflowSelector } from "./WorkflowSelector";
import { ReadinessBadge, ReadinessPanel } from "./ReadinessPanel";
import {
  evaluateWorkflowReadiness,
  splitIndependentWorkflows,
} from "./workflow-product";
import { useEditorStore, type EditorEdge, type EditorNode } from "./editor-store";
import { manualLibraryFor, type ManualLibraryItem } from "./manual-platform-library";
import { ManualNodeLibrary } from "./ManualNodeLibrary";
import { isEditableEditorTarget } from "./editor-interactions";
import { ThemeSelector } from "../../theme/ThemeSelector";
import { useTheme, workflowCanvasThemeTokens } from "../../theme/theme";

const ComparisonExportPanel = lazy(() =>
  import("./ComparisonExportPanel").then((module) => ({
    default: module.ComparisonExportPanel,
  })),
);

export function WorkflowEditor({
  project,
  onBack,
  onHome,
  onSaved,
  onTemplateSaved,
}: {
  project: Project;
  onBack: () => void;
  onHome: () => void;
  onSaved: (project: Project) => void;
  onTemplateSaved: (template: CustomWorkflowTemplate) => void;
}) {
  const store = useEditorStore();
  const { resolvedTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [view, setView] = useState<WorkflowView>("automation");
  const [layoutDirection, setLayoutDirection] = useState<"LR" | "TB">(
    project.platform === "zapier" ? "TB" : "LR",
  );
  const [targetPlatform, setTargetPlatform] = useState<Platform>(
    project.platform,
  );
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<EditorNode, EditorEdge> | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [workflowSetDraft, setWorkflowSetDraft] = useState(project.workflowSet);
  const [nodePendingDelete, setNodePendingDelete] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ type: "node" | "edge"; id: string; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const nodeTypes = useMemo(() => ({ workflow: WorkflowCanvasNode }), []);
  const currentWorkflow = store.workflow ?? project.workflow;
  const effectiveWorkflowSet = useMemo(
    () => normalizeWorkflowSet(currentWorkflow, workflowSetDraft, selectedWorkflowId || workflowSetDraft.workflows[0]?.id),
    [currentWorkflow, workflowSetDraft, selectedWorkflowId],
  );
  const workflows = useMemo(
    () => splitIndependentWorkflows(currentWorkflow, effectiveWorkflowSet),
    [currentWorkflow, effectiveWorkflowSet],
  );
  const manualLibrary = useMemo(() => manualLibraryFor(targetPlatform), [targetPlatform]);
  const activeSlice =
    workflows.find((item) => item.id === selectedWorkflowId) ?? workflows[0]!;
  const activeWorkflow = activeSlice.workflow;
  const plan: PlatformBuildPlan = useMemo(
    () => buildPlatformPlan(targetPlatform, activeWorkflow),
    [targetPlatform, activeWorkflow],
  );
  const validation = useMemo(
    () =>
      validateWorkflow(activeWorkflow, targetPlatform, plan.validationIssues),
    [activeWorkflow, targetPlatform, plan],
  );
  const readiness = useMemo(
    () => evaluateWorkflowReadiness(activeWorkflow, plan),
    [activeWorkflow, plan],
  );
  const activeDomainIds = useMemo(
    () => new Set(activeWorkflow.nodes.map((node) => node.id)),
    [activeWorkflow],
  );
  const visibleNodes = useMemo(
    () =>
      store.nodes
        .filter((node) => activeDomainIds.has(node.data.domainNodeId))
        .map((node) => {
          const domain = activeWorkflow.nodes.find(
            (item) => item.id === node.data.domainNodeId,
          )!;
          const recommendation = plan.nodes.find(
            (item) => item.sourceNodeId === domain.id,
          );
          const clarification = activeWorkflow.clarificationQuestions.some(
            (item) =>
              item.relatedNodeId === domain.id && item.required && !item.answer,
          );
          const internal = [
            "condition",
            "router",
            "filter",
            "loop",
            "merge",
            "split",
            "retry",
            "error_handler",
            "end",
            "logger",
          ].includes(domain.category);
          const productStatus: EditorNode["data"]["productStatus"] =
            clarification
              ? "Needs Clarification"
              : recommendation?.limitations.length
                ? "Platform Limitation"
                : !internal && (!domain.service || !domain.operation)
                  ? "Unresolved"
                  : "Supported";
          const platformBadges = [
            targetPlatform === "make"
              ? "Make"
              : targetPlatform === "n8n"
                ? "n8n"
                : "Zapier",
            recommendation?.limitations.length ? "Workaround" : "Native",
            /webhook|http/i.test(`${domain.service} ${domain.operation}`)
              ? "HTTP / Webhook"
              : "",
          ].filter(Boolean);
          const usedRouteHandles = activeWorkflow.connections
            .filter((connection) => connection.sourceNodeId === domain.id && connection.sourcePort.startsWith("route-"))
            .map((connection) => connection.sourcePort);
          const nextRoute = Math.max(0, ...usedRouteHandles.map((handle) => Number(handle.slice(6)) || 0)) + 1;
          const routeHandles = ["router", "split"].includes(domain.category)
            ? [...new Set([...usedRouteHandles, `route-${nextRoute}`])].sort((left, right) => (Number(left.slice(6)) || 0) - (Number(right.slice(6)) || 0))
            : undefined;
          return {
            ...node,
            data: { ...node.data, platform: targetPlatform, productStatus, platformBadges, ...(routeHandles ? { routeHandles } : {}) },
          };
        }),
    [store.nodes, activeDomainIds, activeWorkflow, plan, targetPlatform],
  );
  const visibleVisualIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );
  const visibleEdges = useMemo(
    () =>
      store.edges.filter(
        (edge) =>
          visibleVisualIds.has(edge.source) &&
          visibleVisualIds.has(edge.target),
      ).map((edge) => ({ ...edge, selected: edge.id === store.selectedEdgeId, reconnectable: true })),
    [store.edges, store.selectedEdgeId, visibleVisualIds],
  );

  useEffect(() => {
    const direction = project.platform === "zapier" ? "TB" : "LR";
    store.initialize(project);
    setWorkflowSetDraft(project.workflowSet);
    setLayoutDirection(direction);
  }, [project.id]);
  useEffect(() => {
    if (!workflows.some((item) => item.id === selectedWorkflowId))
      setSelectedWorkflowId(workflows[0]?.id ?? "");
  }, [workflows, selectedWorkflowId]);
  useEffect(() => {
    store.selectNode(null);
  }, [selectedWorkflowId]);
  useEffect(() => {
    if (!flowInstance || view !== "automation" || !activeWorkflow.nodes.length)
      return;
    const frame = requestAnimationFrame(() => {
      void flowInstance.fitView({ padding: 0.22, duration: 250 });
    });
    return () => cancelAnimationFrame(frame);
  }, [flowInstance, activeSlice.id, activeWorkflow.nodes.length, view]);
  const layoutAndCenterActiveWorkflow = (direction: "LR" | "TB") => {
    store.autoLayout(direction, activeDomainIds);
    requestAnimationFrame(() => {
      void flowInstance?.fitView({ padding: 0.22, duration: 250 });
    });
  };
  const changePlatform = (platform: Platform) => {
    const direction = platform === "zapier" ? "TB" : "LR";
    setTargetPlatform(platform);
    setLayoutDirection(direction);
    layoutAndCenterActiveWorkflow(direction);
  };
  const selectNode: NodeMouseHandler<EditorNode> = (_, node) =>
    store.selectNode(node.id);
  const syncWorkflowSet = () => {
    setWorkflowSetDraft((current) => normalizeWorkflowSet(useEditorStore.getState().workflow, current, activeSlice.id));
  };
  const centerCanvasPosition = () => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds || !flowInstance) return undefined;
    return flowInstance.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
  };
  const addManualNode = (item: ManualLibraryItem, position = centerCanvasPosition()) => {
    store.addNode(item, position, targetPlatform);
    syncWorkflowSet();
    setSaved(false);
  };
  const dropLibraryItem = (event: ReactDragEvent) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("application/x-awm-library-item");
    const item = manualLibrary.items.find((candidate) => candidate.id === itemId);
    if (!item || !flowInstance) return;
    addManualNode(item, flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };
  const reconnect: OnReconnect<EditorEdge> = (edge, connection) => {
    store.reconnect(edge, connection);
    syncWorkflowSet();
    setSaved(false);
  };
  const selectEdge: EdgeMouseHandler = (_, edge) => store.selectEdge(edge.id);
  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      if (!['Delete', 'Backspace'].includes(event.key) || isEditableEditorTarget(event.target)) return;
      if (store.selectedNodeId) {
        event.preventDefault();
        setNodePendingDelete(store.selectedNodeId);
      } else if (store.selectedEdgeId) {
        event.preventDefault();
        store.deleteEdge();
        syncWorkflowSet();
        setSaved(false);
      }
    };
    window.addEventListener('keydown', handleDelete);
    return () => window.removeEventListener('keydown', handleDelete);
  }, [store.selectedNodeId, store.selectedEdgeId, activeSlice.id]);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const visualGraph = {
        nodes: store.nodes.map((node) => ({
          id: node.id,
          position: node.position,
          data: { domainNodeId: node.data.domainNodeId },
        })),
        edges: store.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          data: { domainConnectionId: edge.data!.domainConnectionId },
        })),
      };
      const normalizedSet = normalizeWorkflowSet(
        store.workflow,
        effectiveWorkflowSet,
        activeSlice.id,
      );
      const persistedSet = {
        ...normalizedSet,
        workflows: normalizedSet.workflows.map((item) =>
          item.id === activeSlice.id
            ? {
                ...item,
                readiness:
                  readiness.status === "Needs Clarification"
                    ? ("needs_clarification" as const)
                    : readiness.status === "Platform Limited"
                      ? ("platform_limited" as const)
                      : readiness.status === "Build Ready"
                        ? ("build_ready" as const)
                        : ("draft" as const),
                platformSummary: targetPlatform,
                applications: [
                  ...new Set(
                    activeWorkflow.nodes
                      .map((node) => node.service)
                      .filter((service): service is string => Boolean(service)),
                  ),
                ],
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
        updatedAt: new Date().toISOString(),
      };
      const updated = await projectApi.updateEditor(
        project.id,
        store.workflow,
        persistedSet,
        visualGraph,
      );
      onSaved(updated);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Workflow changes could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };
  const selectedDomainNodeId =
    store.nodes.find((node) => node.id === store.selectedNodeId)?.data
      .domainNodeId ?? null;
  const currentTemplateSnapshot = (): CustomTemplateSnapshot => {
    const visualGraph = {
      nodes: store.nodes.map((node) => ({
        id: node.id,
        position: node.position,
        data: { domainNodeId: node.data.domainNodeId },
      })),
      edges: store.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        data: { domainConnectionId: edge.data!.domainConnectionId },
      })),
    };
    return {
      originalScope: project.originalScope,
      platform: targetPlatform,
      workflow: structuredClone(store.workflow),
      workflowSet: normalizeWorkflowSet(
        store.workflow,
        effectiveWorkflowSet,
        activeSlice.id,
      ),
      visualGraph,
    };
  };
  const saveCustomTemplate = async (
    metadata: CustomTemplateMetadata,
    snapshot?: CustomTemplateSnapshot,
  ) => {
    if (!snapshot) return;
    setTemplateSaving(true);
    try {
      const template = await customTemplateApi.create({
        ...metadata,
        snapshot,
      });
      onTemplateSaved(template);
      setTemplateDialogOpen(false);
    } finally {
      setTemplateSaving(false);
    }
  };

  return (
    <div
      className={`editor-shell ${layoutDirection === "TB" ? "layout-vertical" : "layout-horizontal"} ${workflows.length > 1 ? "has-workflow-selector" : ""}`}
    >
      <header className="editor-topbar sticky-global-header">
        <div className="editor-navigation">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={17} /> Scope
          </button>
          <button className="back-button" onClick={onHome}>
            <LayoutDashboard size={16} /> Dashboard
          </button>
        </div>
        <div className="editor-project">
          <PlatformMark platform={targetPlatform} compact />
          <div>
            <strong>{project.name}</strong>
            <small>{activeSlice.label}</small>
          </div>
          <ReadinessBadge readiness={readiness} />
        </div>
        <div className="editor-actions">
          <WorkflowViewSwitcher value={view} onChange={setView} />
          <label className="platform-plan-select">
            <span>Build for</span>
            <select
              value={targetPlatform}
              onChange={(event) =>
                changePlatform(event.target.value as Platform)
              }
            >
              <option value="zapier">Zapier</option>
              <option value="make">Make.com</option>
              <option value="n8n">n8n</option>
            </select>
          </label>
          <button
            className="button secondary assistant-open"
            onClick={() => setAssistantOpen(true)}
          >
            <Sparkles size={15} />
            Assistant
          </button>
          <button
            className="button secondary compare-open"
            onClick={() => setComparisonOpen(true)}
          >
            <Download size={15} />
            Compare &amp; export
          </button>
          <button
            className="button secondary save-template"
            onClick={() => setTemplateDialogOpen(true)}
            disabled={!store.workflow?.nodes.length}
          >
            <LayoutTemplate size={15} />
            Save as custom template
          </button>
          <ThemeSelector compact />
          <button
            className="icon-button"
            onClick={store.undo}
            disabled={!store.past.length}
            aria-label="Undo"
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            onClick={store.redo}
            disabled={!store.future.length}
            aria-label="Redo"
          >
            <Redo2 size={17} />
          </button>
          <button
            className="button primary save-workflow"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : saved ? (
              <Check size={16} />
            ) : (
              <Save size={16} />
            )}
            {saving ? "Saving…" : saved ? "Saved" : "Save workflow"}
          </button>
        </div>
      </header>
      <WorkflowSelector
        workflows={workflows}
        value={activeSlice.id}
        onChange={setSelectedWorkflowId}
      />
      <div className="editor-body">
        <ManualNodeLibrary library={manualLibrary} onAdd={addManualNode} />
        <section className="canvas-wrap" id="workflow-canvas-export" ref={canvasRef}>
          {error && <div className="canvas-error">{error}</div>}
          {view === "business" ? (
            <BusinessFlowView workflow={activeWorkflow} />
          ) : view === "implementation" ? (
            <ImplementationNotesView workflow={activeWorkflow} plan={plan} />
          ) : view === "handoff" ? (
            <div className="workflow-document-view handoff-view">
              <ReadinessPanel readiness={readiness} />
            </div>
          ) : (
            <ReactFlow<EditorNode, EditorEdge>
              nodes={visibleNodes}
              edges={visibleEdges}
              nodeTypes={nodeTypes}
              onNodesChange={(changes) => {
                store.onNodesChange(changes);
                setSaved(false);
              }}
              onEdgesChange={(changes) => {
                store.onEdgesChange(changes);
                syncWorkflowSet();
                setSaved(false);
              }}
              onConnect={(connection) => {
                store.connect(connection);
                syncWorkflowSet();
                setSaved(false);
              }}
              onReconnect={reconnect}
              onNodeClick={selectNode}
              onEdgeClick={selectEdge}
              onNodeContextMenu={(event, node) => {
                event.preventDefault();
                store.selectNode(node.id);
                setContextMenu({ type: "node", id: node.id, x: event.clientX, y: event.clientY });
              }}
              onEdgeContextMenu={(event, edge) => {
                event.preventDefault();
                store.selectEdge(edge.id);
                setContextMenu({ type: "edge", id: edge.id, x: event.clientX, y: event.clientY });
              }}
              onPaneClick={() => {
                store.selectNode(null);
                setContextMenu(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={dropLibraryItem}
              onInit={setFlowInstance}
              fitView
              fitViewOptions={{ padding: 0.22 }}
              snapToGrid
              snapGrid={[20, 20]}
              deleteKeyCode={null}
              edgesReconnectable
              multiSelectionKeyCode="Shift"
              selectionKeyCode="Shift"
              colorMode={resolvedTheme}
              minZoom={0.25}
              maxZoom={1.8}
            >
              {!visibleNodes.length && (
                <div className="blank-workflow-guide" role="status">
                  <span><Workflow size={24} /></span>
                  <strong>Build your workflow from scratch</strong>
                  <p>Choose a Trigger or Webhook from the node library, add the next steps, then drag between their connection points.</p>
                </div>
              )}
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.2}
                color={workflowCanvasThemeTokens.grid}
              />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={workflowCanvasThemeTokens.minimapNode}
                maskColor={workflowCanvasThemeTokens.minimapMask}
              />
              <Panel position="top-right">
                <div className="layout-tools">
                  <select
                    aria-label="Layout direction"
                    value={layoutDirection}
                    onChange={(event) =>
                      setLayoutDirection(event.target.value as "LR" | "TB")
                    }
                  >
                    <option value="LR">Horizontal</option>
                    <option value="TB">Vertical</option>
                  </select>
                  <button
                    className="canvas-tool"
                    onClick={() =>
                      layoutAndCenterActiveWorkflow(layoutDirection)
                    }
                  >
                    <LayoutDashboard size={15} /> Auto-layout
                  </button>
                </div>
              </Panel>
              <Panel position="bottom-center">
                <ValidationPanel
                  result={validation}
                  onFocusNode={(domainNodeId) => {
                    const visual = store.nodes.find(
                      (node) => node.data.domainNodeId === domainNodeId,
                    );
                    if (visual) store.selectNode(visual.id);
                  }}
                />
              </Panel>
            </ReactFlow>
          )}
        </section>
        {view === "automation" ? (
          <NodeConfigurationPanel plan={plan} />
        ) : (
          <aside className="node-config view-summary">
            <span>
              {view === "business"
                ? "Business flow"
                : view === "implementation"
                  ? "Developer view"
                  : "Client handoff"}
            </span>
            <p>
              {view === "business"
                ? "This view simplifies technical steps for client discussion. Switch to Automation to edit nodes and connections."
                : view === "implementation"
                  ? "Application, operation, credential, and limitation guidance for the selected workflow."
                  : "Resolve blocking readiness items before exporting to a client."}
            </p>
            <strong>{activeWorkflow.nodes.length} synchronized steps</strong>
            <ReadinessBadge readiness={readiness} />
          </aside>
        )}
      </div>
      {assistantOpen && (
        <AssistantPanel
          projectId={project.id}
          workflow={currentWorkflow}
          selectedNodeId={selectedDomainNodeId}
          onClose={() => setAssistantOpen(false)}
          onApply={(proposal) => {
            store.applyProposedWorkflow(proposal.proposedWorkflow);
            syncWorkflowSet();
            setAssistantOpen(false);
            setSaved(false);
          }}
        />
      )}
      {comparisonOpen && (
        <Suspense
          fallback={
            <div className="panel-loading" role="status">
              <LoaderCircle className="spin" size={18} />
              Loading comparison and export tools…
            </div>
          }
        >
          <ComparisonExportPanel
            workflow={activeWorkflow}
            workflowSet={effectiveWorkflowSet}
            selectedWorkflowId={activeSlice.id}
            platform={targetPlatform}
            canvasId="workflow-canvas-export"
            nodes={visibleNodes}
            onClose={() => setComparisonOpen(false)}
          />
        </Suspense>
      )}
      {contextMenu && (
        <div className="editor-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" role="menuitem" onClick={() => {
            if (contextMenu.type === "node") setNodePendingDelete(contextMenu.id);
            else {
              store.deleteEdge(contextMenu.id);
              syncWorkflowSet();
              setSaved(false);
            }
            setContextMenu(null);
          }}>{contextMenu.type === "node" ? "Delete node…" : "Delete connection"}</button>
        </div>
      )}
      <ConfirmationDialog
        open={Boolean(nodePendingDelete)}
        title="Delete this node?"
        message="This node and its connected lines will be removed from the workflow."
        confirmLabel="Delete node"
        onCancel={() => setNodePendingDelete(null)}
        onConfirm={() => {
          store.deleteNode(nodePendingDelete);
          syncWorkflowSet();
          setNodePendingDelete(null);
          setSaved(false);
        }}
      />
      <CustomTemplateDialog
        open={templateDialogOpen}
        busy={templateSaving}
        snapshot={templateDialogOpen ? currentTemplateSnapshot() : undefined}
        onClose={() => setTemplateDialogOpen(false)}
        onSave={saveCustomTemplate}
      />
    </div>
  );
}
