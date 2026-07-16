import type { CreateProjectInput, Platform, Project } from '@awm/shared';
import { Bell, Boxes, ChevronDown, CircleHelp, Clock3, FileText, FolderKanban, LayoutDashboard, Plus, Search, Settings, Sparkles, Workflow } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { projectApi } from './api/projects';
import { NewProjectDialog } from './components/NewProjectDialog';
import { PlatformMark } from './components/PlatformMark';
import { ScopeWorkspace } from './components/ScopeWorkspace';
import { WorkflowEditor } from './features/editor/WorkflowEditor';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<'all' | Platform>('all');
  const [error, setError] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editorProject, setEditorProject] = useState<Project | null>(null);

  useEffect(() => { projectApi.list().then(setProjects).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load projects.')).finally(() => setLoading(false)); }, []);
  const visible = useMemo(() => projects.filter((project) => (platform === 'all' || project.platform === platform) && `${project.name} ${project.clientName}`.toLowerCase().includes(query.toLowerCase())), [projects, platform, query]);
  const create = async (input: CreateProjectInput) => {
    setCreating(true); setError('');
    try { const project = await projectApi.create(input); setProjects((current) => [project, ...current]); setDialogOpen(false); setSelectedProject(project); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create project.'); }
    finally { setCreating(false); }
  };

  const saveProjectState = (updated: Project) => { setSelectedProject(updated); setEditorProject((current) => current?.id === updated.id ? updated : current); setProjects((current) => current.map((item) => item.id === updated.id ? updated : item)); };
  if (editorProject) return <WorkflowEditor project={editorProject} onBack={() => setEditorProject(null)} onSaved={saveProjectState} />;
  if (selectedProject) return <ScopeWorkspace project={selectedProject} onBack={() => setSelectedProject(null)} onSaved={saveProjectState} onOpenBuilder={selectedProject.workflow.nodes.length ? () => setEditorProject(selectedProject) : undefined} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Workflow size={20} /></span><span>FlowMapper</span></div>
      <button className="button primary new-project" onClick={() => setDialogOpen(true)}><Plus size={18} /> New project</button>
      <nav aria-label="Main navigation"><p className="nav-label">Workspace</p><a className="nav-item active" href="#dashboard"><LayoutDashboard size={18} /> Dashboard</a><a className="nav-item" href="#projects"><FolderKanban size={18} /> All projects <span>{projects.length}</span></a><a className="nav-item" href="#recent"><Clock3 size={18} /> Recent</a><p className="nav-label">Tools</p><a className="nav-item" href="#compare"><Boxes size={18} /> Compare platforms</a><a className="nav-item" href="#templates"><FileText size={18} /> Templates</a></nav>
      <div className="sidebar-bottom"><a className="nav-item" href="#help"><CircleHelp size={18} /> Help & resources</a><a className="nav-item" href="#settings"><Settings size={18} /> Settings</a><div className="account"><span>JP</span><div><strong>Workspace owner</strong><small>Local workspace</small></div><ChevronDown size={16} /></div></div>
    </aside>
    <main>
      <header className="topbar sticky-global-header"><div className="global-search"><Search size={18} /><input aria-label="Search everything" placeholder="Search projects and workflows…" /><kbd>⌘ K</kbd></div><button className="icon-button" aria-label="Notifications"><Bell size={19} /></button><span className="status-dot">System ready</span></header>
      <div className="content">
        <section className="hero"><div><p className="eyebrow"><Sparkles size={14} /> Automation architecture workspace</p><h1>Turn requirements into<br /><em>clear workflow plans.</em></h1><p>Map, validate, and document automations before you build them in Zapier, Make, or n8n.</p></div><button className="button primary hero-action" onClick={() => setDialogOpen(true)}><Plus size={18} /> Create workflow</button></section>
        <section className="stats" aria-label="Workspace summary"><article><span>Projects</span><strong>{projects.length}</strong><small>in this workspace</small></article><article><span>Draft workflows</span><strong>{projects.filter((item) => item.status === 'draft').length}</strong><small>ready to continue</small></article><article><span>Platforms</span><strong>{new Set(projects.map((item) => item.platform)).size || 3}</strong><small>Zapier · Make · n8n</small></article><article className="insight"><Sparkles size={18} /><div><span>Architecture tip</span><small>Define the trigger and failure path early.</small></div></article></section>
        <section className="projects-section" id="projects"><div className="section-head"><div><h2>Your projects</h2><p>Workflow plans and client architectures</p></div><div className="filters"><div className="search-box"><Search size={16} /><input aria-label="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" /></div><select aria-label="Filter platform" value={platform} onChange={(event) => setPlatform(event.target.value as 'all' | Platform)}><option value="all">All platforms</option><option value="zapier">Zapier</option><option value="make">Make</option><option value="n8n">n8n</option></select></div></div>
          {error && <div className="error-banner" role="alert">{error}</div>}
          {loading ? <div className="project-grid">{[1, 2, 3].map((item) => <div className="project-card skeleton" key={item} />)}</div> : visible.length ? <div className="project-grid">{visible.map((project) => <button type="button" className="project-card" key={project.id} onClick={() => setSelectedProject(project)}><div className="card-top"><PlatformMark platform={project.platform} compact /><span className={`project-status ${project.status}`}>{project.status.replace('_', ' ')}</span></div><div><h3>{project.name}</h3><p>{project.originalScope ? `${project.originalScope.slice(0, 100)}${project.originalScope.length > 100 ? '…' : ''}` : project.description || 'Ready for scope and requirements.'}</p></div><div className="card-meta"><span>{project.clientName || 'Internal project'}</span><time dateTime={project.updatedAt}>Updated {new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round((new Date(project.updatedAt).getTime() - Date.now()) / 86_400_000), 'day')}</time></div></button>)}</div> : <div className="empty-state"><span><Workflow size={28} /></span><h3>{query || platform !== 'all' ? 'No matching projects' : 'Your first workflow starts here'}</h3><p>{query || platform !== 'all' ? 'Try adjusting the search or platform filter.' : 'Create a project, choose a platform, and turn a scope of work into an implementation-ready plan.'}</p>{!query && platform === 'all' && <button className="button primary" onClick={() => setDialogOpen(true)}><Plus size={17} /> Create first project</button>}</div>}
        </section>
      </div>
    </main>
    <NewProjectDialog open={dialogOpen} busy={creating} onClose={() => setDialogOpen(false)} onCreate={create} />
  </div>;
}
