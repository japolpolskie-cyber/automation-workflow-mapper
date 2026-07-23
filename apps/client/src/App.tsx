import type {
  CreateProjectInput,
  CustomTemplateMetadata,
  CustomWorkflowTemplate,
  Platform,
  Project,
} from "@awm/shared";
import {
  Archive,
  Bell,
  BookOpen,
  Boxes,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { customTemplateApi, projectApi } from "./api/projects";
import { CustomTemplateDialog } from "./components/CustomTemplateDialog";
import { ConfirmationDialog } from "./components/ConfirmationDialog";
import { MyTemplates } from "./components/MyTemplates";
import {
  NewProjectDialog,
  type ProjectCreationMode,
} from "./components/NewProjectDialog";
import { PlatformMark } from "./components/PlatformMark";
import { ScopeWorkspace } from "./components/ScopeWorkspace";
import { WorkflowEditor } from "./features/editor/WorkflowEditor";
import { ThemeSelector } from "./theme/ThemeSelector";
import { TemplateGallery } from "./components/TemplateGallery";
import type { WorkflowTemplate } from "./data/workflow-templates";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [error, setError] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editorProject, setEditorProject] = useState<Project | null>(null);
  const [selectedTemplate, setSelectedTemplate] =
    useState<WorkflowTemplate | null>(null);
  const [customTemplates, setCustomTemplates] = useState<
    CustomWorkflowTemplate[]
  >([]);
  const [templateError, setTemplateError] = useState("");
  const [templateBusyId, setTemplateBusyId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] =
    useState<CustomWorkflowTemplate | null>(null);
  const [templatePendingDelete, setTemplatePendingDelete] =
    useState<CustomWorkflowTemplate | null>(null);
  const [projectPendingDelete, setProjectPendingDelete] =
    useState<Project | null>(null);
  const [projectDeleteBusy, setProjectDeleteBusy] = useState(false);

  useEffect(() => {
    projectApi
      .list()
      .then(setProjects)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Projects could not be loaded. Confirm the local server is running, then try again.",
        ),
      )
      .finally(() => setLoading(false));
    projectApi
      .listArchived()
      .then(setArchivedProjects)
      .catch(() => setError("Archived projects could not be loaded."));
  }, []);
  useEffect(() => {
    customTemplateApi
      .list()
      .then(setCustomTemplates)
      .catch(() =>
        setTemplateError(
          "Personal templates could not be loaded. Confirm the local server is running, then try again.",
        ),
      );
  }, []);
  const visible = useMemo(
    () =>
      (showArchived ? archivedProjects : projects).filter(
        (project) =>
          (platform === "all" || project.platform === platform) &&
          `${project.name} ${project.clientName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [archivedProjects, projects, platform, query, showArchived],
  );
  const create = async (
    input: CreateProjectInput,
    mode: ProjectCreationMode,
  ) => {
    setCreating(true);
    setError("");
    try {
      const project = await projectApi.create(input);
      const readyProject = selectedTemplate
        ? await projectApi.updateScope(project.id, selectedTemplate.scope)
        : project;
      setProjects((current) => [readyProject, ...current]);
      setDialogOpen(false);
      setSelectedTemplate(null);
      if (mode === "blank") {
        setSelectedProject(null);
        setEditorProject(readyProject);
      } else {
        setSelectedProject(readyProject);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create project.",
      );
    } finally {
      setCreating(false);
    }
  };

  const saveProjectState = (updated: Project) => {
    setSelectedProject(updated);
    setEditorProject((current) =>
      current?.id === updated.id ? updated : current,
    );
    setProjects((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  };
  const archiveProject = async (project: Project) => {
    if (
      !window.confirm(
        `Archive "${project.name}"? It will be removed from Your projects, while its workflow and history remain saved.`,
      )
    )
      return;
    setError("");
    try {
      await projectApi.archive(project.id);
      setProjects((current) =>
        current.filter((item) => item.id !== project.id),
      );
      setArchivedProjects((current) => [
        { ...project, status: "archived" },
        ...current,
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The project could not be archived.",
      );
    }
  };
  const restoreProject = async (project: Project) => {
    setError("");
    try {
      const restored = await projectApi.restore(project.id);
      setArchivedProjects((current) =>
        current.filter((item) => item.id !== project.id),
      );
      setProjects((current) => [restored, ...current]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The project could not be restored.",
      );
    }
  };
  const deleteProject = async (project: Project) => {
    setProjectDeleteBusy(true);
    setError("");
    try {
      await projectApi.delete(project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setArchivedProjects((current) => current.filter((item) => item.id !== project.id));
      setSelectedProject((current) => current?.id === project.id ? null : current);
      setEditorProject((current) => current?.id === project.id ? null : current);
      setProjectPendingDelete(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be deleted.");
    } finally {
      setProjectDeleteBusy(false);
    }
  };
  const useCustomTemplate = async (template: CustomWorkflowTemplate) => {
    setTemplateBusyId(template.id);
    setTemplateError("");
    try {
      const project = await customTemplateApi.use(template.id);
      setProjects((current) => [project, ...current]);
      setEditorProject(project);
    } catch (cause) {
      setTemplateError(
        cause instanceof Error
          ? cause.message
          : "The personal template could not be opened.",
      );
    } finally {
      setTemplateBusyId(null);
    }
  };
  const updateCustomTemplate = async (metadata: CustomTemplateMetadata) => {
    if (!editingTemplate) return;
    const updated = await customTemplateApi.update(
      editingTemplate.id,
      metadata,
    );
    setCustomTemplates((current) =>
      current.map((template) =>
        template.id === updated.id ? updated : template,
      ),
    );
    setEditingTemplate(null);
  };
  const deleteCustomTemplate = async (template: CustomWorkflowTemplate) => {
    setTemplateBusyId(template.id);
    setTemplateError("");
    try {
      await customTemplateApi.delete(template.id);
      setCustomTemplates((current) =>
        current.filter((item) => item.id !== template.id),
      );
      setTemplatePendingDelete(null);
    } catch (cause) {
      setTemplateError(
        cause instanceof Error
          ? cause.message
          : "The personal template could not be deleted.",
      );
    } finally {
      setTemplateBusyId(null);
    }
  };
  if (editorProject)
    return (
      <WorkflowEditor
        project={editorProject}
        onBack={() => setEditorProject(null)}
        onHome={() => {
          setEditorProject(null);
          setSelectedProject(null);
          setShowArchived(false);
        }}
        onSaved={saveProjectState}
        onTemplateSaved={(template) =>
          setCustomTemplates((current) => [template, ...current])
        }
      />
    );
  if (selectedProject)
    return (
      <ScopeWorkspace
        key={selectedProject.id}
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
        onSaved={saveProjectState}
        onOpenBuilder={
          selectedProject.workflow.nodes.length || !selectedProject.originalScope.trim()
            ? () => setEditorProject(selectedProject)
            : undefined
        }
      />
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Workflow size={20} />
          </span>
          <span>FlowMapper</span>
        </div>
        <button
          className="button primary new-project"
          onClick={() => {
            setSelectedTemplate(null);
            setDialogOpen(true);
          }}
        >
          <Plus size={18} /> New project
        </button>
        <nav aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          <a className={`nav-item ${showArchived ? "" : "active"}`} href="#dashboard" onClick={() => setShowArchived(false)}>
            <LayoutDashboard size={18} /> Dashboard
          </a>
          <a className="nav-item" href="#projects" onClick={() => setShowArchived(false)}>
            <FolderKanban size={18} /> All projects{" "}
            <span>{projects.length}</span>
          </a>
          <a className={`nav-item ${showArchived ? "active" : ""}`} href="#projects" onClick={() => setShowArchived(true)}>
            <Archive size={18} /> Archived projects{" "}
            <span>{archivedProjects.length}</span>
          </a>
          <span
            className="nav-item disabled"
            aria-disabled="true"
            title="Recent projects are not available in RC1"
          >
            <Clock3 size={18} /> Recent
          </span>
          <p className="nav-label">Tools</p>
          <span
            className="nav-item disabled"
            aria-disabled="true"
            title="Open a workflow to compare platforms"
          >
            <Boxes size={18} /> Compare platforms
          </span>
          <a className="nav-item" href="#templates">
            <FileText size={18} /> Templates
          </a>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="#help">
            <CircleHelp size={18} /> Help & resources
          </a>
          <span
            className="nav-item disabled"
            aria-disabled="true"
            title="Settings are not available in RC1"
          >
            <Settings size={18} /> Settings
          </span>
          <div className="account">
            <span>JP</span>
            <div>
              <strong>Workspace owner</strong>
              <small>Local workspace</small>
            </div>
            <ChevronDown size={16} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar sticky-global-header">
          <div className="global-search">
            <Search size={18} />
            <input
              aria-label="Search all projects"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search all projects"
            />
          </div>
          <ThemeSelector compact />
          <button
            className="icon-button"
            aria-label="Notifications unavailable in RC1"
            title="Notifications are not available in RC1"
            disabled
          >
            <Bell size={19} />
          </button>
          <span className="status-dot">System ready</span>
        </header>
        <div className="content">
          <section className="hero" id="dashboard">
            <div>
              <p className="eyebrow">
                <Sparkles size={14} /> Automation architecture workspace
              </p>
              <h1>
                Turn requirements into
                <br />
                <em>clear workflow plans.</em>
              </h1>
              <p>
                Map, validate, and document draft automation plans before you
                build them in Zapier, Make, or n8n.
              </p>
            </div>
            <button
              className="button primary hero-action"
              onClick={() => {
                setSelectedTemplate(null);
                setDialogOpen(true);
              }}
            >
              <Plus size={18} /> Create workflow
            </button>
          </section>
          <section className="stats" aria-label="Workspace summary">
            <article>
              <span>Projects</span>
              <strong>{projects.length}</strong>
              <small>in this workspace</small>
            </article>
            <article>
              <span>Draft workflows</span>
              <strong>
                {projects.filter((item) => item.status === "draft").length}
              </strong>
              <small>ready to continue</small>
            </article>
            <article>
              <span>Platforms</span>
              <strong>
                {new Set(projects.map((item) => item.platform)).size || 3}
              </strong>
              <small>Zapier · Make · n8n</small>
            </article>
            <article className="insight">
              <Sparkles size={18} />
              <div>
                <span>Architecture tip</span>
                <small>Define the trigger and failure path early.</small>
              </div>
            </article>
          </section>
          <section className="projects-section" id="projects">
            <div className="section-head">
              <div>
                <h2>{showArchived ? "Archived projects" : "Your projects"}</h2>
                <p>{showArchived ? "Preserved workflow plans hidden from the active workspace" : "Workflow plans and client architectures"}</p>
              </div>
              <div className="filters">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    aria-label="Search projects"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search projects"
                  />
                </div>
                <select
                  aria-label="Filter platform"
                  value={platform}
                  onChange={(event) =>
                    setPlatform(event.target.value as "all" | Platform)
                  }
                >
                  <option value="all">All platforms</option>
                  <option value="zapier">Zapier</option>
                  <option value="make">Make</option>
                  <option value="n8n">n8n</option>
                </select>
              </div>
            </div>
            {error && (
              <div className="error-banner enhanced-feedback" role="alert">
                <CircleHelp size={18} />
                <div>
                  <strong>Projects are temporarily unavailable</strong>
                  <p>{error}</p>
                </div>
              </div>
            )}
            {loading ? (
              <div
                className="project-grid"
                aria-label="Loading projects"
                aria-busy="true"
              >
                {[1, 2, 3].map((item) => (
                  <div className="project-card skeleton" key={item} />
                ))}
              </div>
            ) : visible.length ? (
              <div className="project-grid">
                {visible.map((project) => (
                  <article className="project-card" key={project.id}>
                    <button
                      type="button"
                      className="project-card-open"
                      aria-label={`Open ${project.name}`}
                      onClick={() => setSelectedProject(project)}
                    />
                    <div className="card-top">
                      <PlatformMark platform={project.platform} compact />
                      <span className={`project-status ${project.status}`}>
                        {project.status.replace("_", " ")}
                      </span>
                    </div>
                    <div>
                      <h3>{project.name}</h3>
                      <p>
                        {project.originalScope
                          ? `${project.originalScope.slice(0, 100)}${project.originalScope.length > 100 ? "…" : ""}`
                          : project.description ||
                            "Ready for scope and requirements."}
                      </p>
                    </div>
                    <div className="card-meta">
                      <span>{project.clientName || "Internal project"}</span>
                      <time dateTime={project.updatedAt}>
                        Updated{" "}
                        {new Intl.RelativeTimeFormat("en", {
                          numeric: "auto",
                        }).format(
                          Math.round(
                            (new Date(project.updatedAt).getTime() -
                              Date.now()) /
                              86_400_000,
                          ),
                          "day",
                        )}
                      </time>
                    </div>
                    {!showArchived && !project.workflow.nodes.length && !project.originalScope.trim() && (
                      <button
                        type="button"
                        className="project-open-blank"
                        onClick={() => setEditorProject(project)}
                      >
                        Open blank workflow
                      </button>
                    )}
                    {showArchived ? (
                      <button
                        type="button"
                        className="project-archive"
                        aria-label={`Restore ${project.name}`}
                        title="Restore project"
                        onClick={() => void restoreProject(project)}
                      >
                        <RotateCcw size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="project-archive"
                        aria-label={`Archive ${project.name}`}
                        title="Archive project"
                        onClick={() => void archiveProject(project)}
                      >
                        <Archive size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="project-delete"
                      aria-label={`Delete ${project.name}`}
                      title="Delete project permanently"
                      onClick={() => setProjectPendingDelete(project)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span>
                  <Workflow size={28} />
                </span>
                <h3>
                  {query || platform !== "all"
                    ? "No matching projects"
                    : showArchived
                      ? "No archived projects"
                    : "Your first workflow starts here"}
                </h3>
                <p>
                  {query || platform !== "all"
                    ? "Try adjusting the search or platform filter."
                    : showArchived
                      ? "Projects you archive will appear here and can be restored at any time."
                    : "Create a project, choose a platform, and turn a scope of work into a reviewable draft plan."}
                </p>
                {!showArchived && !query && platform === "all" && (
                  <button
                    className="button primary"
                    onClick={() => {
                      setSelectedTemplate(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus size={17} /> Create first project
                  </button>
                )}
              </div>
            )}
          </section>
          <section className="templates-section" id="templates">
            <div className="section-head">
              <div>
                <h2>Start with a proven example</h2>
                <p>
                  Choose a realistic request, then tailor the requirements to
                  your business.
                </p>
              </div>
              <span className="draft-pill">
                <ShieldCheck size={14} /> Draft plans require review
              </span>
            </div>
            <TemplateGallery
              onSelect={(template) => {
                setSelectedTemplate(template);
                setDialogOpen(true);
              }}
            />
          </section>
          <section
            className="templates-section my-templates-section"
            id="my-templates"
          >
            <div className="section-head">
              <div>
                <h2>My templates</h2>
                <p>Personal workflow snapshots saved from the builder.</p>
              </div>
            </div>
            {templateError && (
              <div className="error-banner enhanced-feedback" role="alert">
                <CircleHelp size={18} />
                <div>
                  <strong>
                    Personal templates are temporarily unavailable
                  </strong>
                  <p>{templateError}</p>
                </div>
              </div>
            )}
            <MyTemplates
              templates={customTemplates}
              busyId={templateBusyId}
              onUse={(template) => void useCustomTemplate(template)}
              onEdit={setEditingTemplate}
              onDelete={setTemplatePendingDelete}
            />
          </section>
          <section
            className="resource-section"
            id="help"
            aria-labelledby="resources-title"
          >
            <div>
              <p className="eyebrow">
                <BookOpen size={14} /> Product guidance
              </p>
              <h2 id="resources-title">Build with clear expectations</h2>
              <p>
                Learn what the planner produces, where platforms differ, and
                what to review before implementation.
              </p>
            </div>
            <nav aria-label="Product documentation">
              <a href="#templates">
                <FileText size={17} />
                <span>
                  <strong>Templates</strong>
                  <small>Explore curated workflow requests</small>
                </span>
              </a>
              <a href="#planner-overview">
                <Workflow size={17} />
                <span>
                  <strong>Planner overview</strong>
                  <small>Understand draft workflow plans</small>
                </span>
              </a>
              <a href="#supported-platforms">
                <Boxes size={17} />
                <span>
                  <strong>Supported platforms</strong>
                  <small>Review connector coverage</small>
                </span>
              </a>
              <a href="#current-limitations">
                <LifeBuoy size={17} />
                <span>
                  <strong>Current limitations</strong>
                  <small>Know what needs manual review</small>
                </span>
              </a>
            </nav>
            <div className="resource-details">
              <article id="planner-overview">
                <strong>Planner overview</strong>
                <p>
                  The planner turns requirements into a reviewable business,
                  automation, and developer view. It does not deploy workflows.
                </p>
              </article>
              <article id="supported-platforms">
                <strong>Supported platforms</strong>
                <p>
                  Compare plans for n8n, Make, and Zapier. Native, HTTP,
                  webhook, workaround, and unsupported states remain visible.
                </p>
              </article>
              <article id="current-limitations">
                <strong>Current limitations</strong>
                <p>
                  Credentials, account-specific fields, ambiguous business
                  rules, and platform-limited operations require human review
                  before implementation.
                </p>
              </article>
            </div>
          </section>
        </div>
      </main>
      <NewProjectDialog
        open={dialogOpen}
        busy={creating}
        template={selectedTemplate}
        onClose={() => {
          setDialogOpen(false);
          setSelectedTemplate(null);
        }}
        onCreate={create}
      />
      <CustomTemplateDialog
        open={Boolean(editingTemplate)}
        busy={false}
        template={editingTemplate ?? undefined}
        onClose={() => setEditingTemplate(null)}
        onSave={updateCustomTemplate}
      />
      <ConfirmationDialog
        open={Boolean(projectPendingDelete)}
        title="Delete this project permanently?"
        message={`"${projectPendingDelete?.name ?? "This project"}" and its saved workflow history will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete project"
        busy={projectDeleteBusy}
        onCancel={() => setProjectPendingDelete(null)}
        onConfirm={() => {
          if (projectPendingDelete) void deleteProject(projectPendingDelete);
        }}
      />
      <ConfirmationDialog
        open={Boolean(templatePendingDelete)}
        title="Delete this template?"
        message="This template will be permanently removed. Projects created from it will not be affected."
        confirmLabel="Delete template"
        busy={Boolean(templatePendingDelete && templateBusyId === templatePendingDelete.id)}
        onCancel={() => setTemplatePendingDelete(null)}
        onConfirm={() => {
          if (templatePendingDelete) void deleteCustomTemplate(templatePendingDelete);
        }}
      />
    </div>
  );
}
