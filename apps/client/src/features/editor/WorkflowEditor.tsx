import { Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, type NodeMouseHandler } from '@xyflow/react';
import { validateWorkflow, type Platform, type PlatformBuildPlan, type Project, type WorkflowNode } from '@awm/shared';
import { buildPlatformPlan } from '@awm/platforms';
import { ArrowLeft, Check, Download, LayoutDashboard, LoaderCircle, Redo2, Save, Sparkles, Undo2, Workflow } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { projectApi } from '../../api/projects';
import { PlatformMark } from '../../components/PlatformMark';
import { AssistantPanel } from './AssistantPanel';
import { BusinessFlowView } from './BusinessFlowView';
import { ComparisonExportPanel } from './ComparisonExportPanel';
import { NodeConfigurationPanel } from './NodeConfigurationPanel';
import { ImplementationNotesView } from './ImplementationNotesView';
import { ValidationPanel } from './ValidationPanel';
import { WorkflowCanvasNode } from './WorkflowCanvasNode';
import { WorkflowViewSwitcher, type WorkflowView } from './WorkflowViewSwitcher';
import { WorkflowSelector } from './WorkflowSelector';
import { ReadinessBadge, ReadinessPanel } from './ReadinessPanel';
import { evaluateWorkflowReadiness, splitIndependentWorkflows } from './workflow-product';
import { useEditorStore, type EditorNode } from './editor-store';

const palette: Array<{ category: WorkflowNode['category']; label: string }> = [
  { category: 'trigger', label: 'Trigger' }, { category: 'webhook', label: 'Webhook' }, { category: 'action', label: 'Action' }, { category: 'ai', label: 'AI' },
  { category: 'condition', label: 'Condition' }, { category: 'router', label: 'Router' },
  { category: 'transformation', label: 'Transform' }, { category: 'delay', label: 'Delay' }, { category: 'loop', label: 'Loop' },
  { category: 'api_request', label: 'API request' }, { category: 'database', label: 'Database' }, { category: 'crm', label: 'CRM' }, { category: 'spreadsheet', label: 'Spreadsheet' },
  { category: 'email', label: 'Email' }, { category: 'messaging', label: 'Messaging' }, { category: 'notification', label: 'Notification' }, { category: 'human_approval', label: 'Approval' },
  { category: 'retry', label: 'Retry' }, { category: 'error_handler', label: 'Error handler' }, { category: 'merge', label: 'Merge' }, { category: 'split', label: 'Split' }, { category: 'logger', label: 'Logger' }, { category: 'end', label: 'End' },
];

export function WorkflowEditor({ project, onBack, onSaved }: { project: Project; onBack: () => void; onSaved: (project: Project) => void }) {
  const store = useEditorStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [view, setView] = useState<WorkflowView>('automation');
  const [layoutDirection, setLayoutDirection] = useState<'LR' | 'TB'>(project.platform === 'zapier' ? 'TB' : 'LR');
  const [targetPlatform, setTargetPlatform] = useState<Platform>(project.platform);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const nodeTypes = useMemo(() => ({ workflow: WorkflowCanvasNode }), []);
  const currentWorkflow = store.workflow ?? project.workflow;
  const workflows = useMemo(() => splitIndependentWorkflows(currentWorkflow), [currentWorkflow]);
  const activeSlice = workflows.find((item) => item.id === selectedWorkflowId) ?? workflows[0]!;
  const activeWorkflow = activeSlice.workflow;
  const plan: PlatformBuildPlan = useMemo(() => buildPlatformPlan(targetPlatform, activeWorkflow), [targetPlatform, activeWorkflow]);
  const validation = useMemo(() => validateWorkflow(activeWorkflow, targetPlatform, plan.validationIssues), [activeWorkflow, targetPlatform, plan]);
  const readiness = useMemo(() => evaluateWorkflowReadiness(activeWorkflow, plan), [activeWorkflow, plan]);
  const activeDomainIds = useMemo(() => new Set(activeWorkflow.nodes.map((node) => node.id)), [activeWorkflow]);
  const visibleNodes = useMemo(() => store.nodes.filter((node) => activeDomainIds.has(node.data.domainNodeId)).map((node) => {
    const domain = activeWorkflow.nodes.find((item) => item.id === node.data.domainNodeId)!;
    const recommendation = plan.nodes.find((item) => item.sourceNodeId === domain.id);
    const clarification = activeWorkflow.clarificationQuestions.some((item) => item.relatedNodeId === domain.id && item.required && !item.answer);
    const internal = ['condition', 'router', 'filter', 'loop', 'merge', 'split', 'retry', 'error_handler', 'end', 'logger'].includes(domain.category);
    const productStatus: EditorNode['data']['productStatus'] = clarification ? 'Needs Clarification' : recommendation?.limitations.length ? 'Platform Limitation' : !internal && (!domain.service || !domain.operation) ? 'Unresolved' : 'Supported';
    const platformBadges = [targetPlatform === 'make' ? 'Make' : targetPlatform === 'n8n' ? 'n8n' : 'Zapier', recommendation?.limitations.length ? 'Workaround' : 'Native', /webhook|http/i.test(`${domain.service} ${domain.operation}`) ? 'HTTP / Webhook' : ''].filter(Boolean);
    return { ...node, data: { ...node.data, productStatus, platformBadges } };
  }), [store.nodes, activeDomainIds, activeWorkflow, plan, targetPlatform]);
  const visibleVisualIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => store.edges.filter((edge) => visibleVisualIds.has(edge.source) && visibleVisualIds.has(edge.target)), [store.edges, visibleVisualIds]);

  useEffect(() => {
    const direction = project.platform === 'zapier' ? 'TB' : 'LR';
    store.initialize(project);
    setLayoutDirection(direction);
    store.autoLayout(direction);
  }, [project.id]);
  useEffect(() => {
    if (!workflows.some((item) => item.id === selectedWorkflowId)) setSelectedWorkflowId(workflows[0]?.id ?? '');
  }, [workflows, selectedWorkflowId]);
  useEffect(() => { store.selectNode(null); }, [selectedWorkflowId]);
  const changePlatform = (platform: Platform) => {
    const direction = platform === 'zapier' ? 'TB' : 'LR';
    setTargetPlatform(platform);
    setLayoutDirection(direction);
    store.autoLayout(direction);
  };
  const selectNode: NodeMouseHandler<EditorNode> = (_, node) => store.selectNode(node.id);
  const save = async () => {
    setSaving(true); setError('');
    try {
      const visualGraph = {
        nodes: store.nodes.map((node) => ({ id: node.id, position: node.position, data: { domainNodeId: node.data.domainNodeId } })),
        edges: store.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, data: { domainConnectionId: edge.data!.domainConnectionId } })),
      };
      const updated = await projectApi.updateEditor(project.id, store.workflow, visualGraph);
      onSaved(updated); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Workflow changes could not be saved.'); }
    finally { setSaving(false); }
  };
  const selectedDomainNodeId = store.nodes.find((node) => node.id === store.selectedNodeId)?.data.domainNodeId ?? null;

  return <div className={`editor-shell ${layoutDirection === 'TB' ? 'layout-vertical' : 'layout-horizontal'} ${workflows.length > 1 ? 'has-workflow-selector' : ''}`}>
    <header className="editor-topbar sticky-global-header">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Scope</button>
      <div className="editor-project"><PlatformMark platform={targetPlatform} compact /><div><strong>{project.name}</strong><small>{activeSlice.label}</small></div><ReadinessBadge readiness={readiness} /></div>
      <div className="editor-actions">
        <WorkflowViewSwitcher value={view} onChange={setView} />
        <label className="platform-plan-select"><span>Build for</span><select value={targetPlatform} onChange={(event) => changePlatform(event.target.value as Platform)}><option value="zapier">Zapier</option><option value="make">Make.com</option><option value="n8n">n8n</option></select></label>
        <button className="button secondary assistant-open" onClick={() => setAssistantOpen(true)}><Sparkles size={15} />Assistant</button>
        <button className="button secondary compare-open" onClick={() => setComparisonOpen(true)}><Download size={15} />Compare &amp; export</button>
        <button className="icon-button" onClick={store.undo} disabled={!store.past.length} aria-label="Undo"><Undo2 size={17} /></button>
        <button className="icon-button" onClick={store.redo} disabled={!store.future.length} aria-label="Redo"><Redo2 size={17} /></button>
        <button className="button primary save-workflow" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={16} /> : saved ? <Check size={16} /> : <Save size={16} />}{saving ? 'Saving…' : saved ? 'Saved' : 'Save workflow'}</button>
      </div>
    </header>
    <WorkflowSelector workflows={workflows} value={activeSlice.id} onChange={setSelectedWorkflowId} />
    <div className="editor-body">
      <aside className="node-palette"><div className="palette-brand"><Workflow size={18} /><div><strong>Node library</strong><span>Click to add a step</span></div></div><div className="palette-list">{palette.map((item) => <button key={item.category} onClick={() => { store.addNode(item.category); setSaved(false); }}><span className={`palette-dot category-${item.category}`} />{item.label}</button>)}</div><div className="palette-tip"><LayoutDashboard size={15} /><p>Drag nodes to arrange them. Connect handles to define execution order.</p></div></aside>
      <section className="canvas-wrap" id="workflow-canvas-export">
        {error && <div className="canvas-error">{error}</div>}
        {view === 'business' ? <BusinessFlowView workflow={activeWorkflow} /> : view === 'implementation' ? <ImplementationNotesView workflow={activeWorkflow} plan={plan} /> : view === 'handoff' ? <div className="workflow-document-view handoff-view"><ReadinessPanel readiness={readiness} /></div> : <ReactFlow<EditorNode> nodes={visibleNodes} edges={visibleEdges} nodeTypes={nodeTypes} onNodesChange={(changes) => { store.onNodesChange(changes); setSaved(false); }} onEdgesChange={(changes) => { store.onEdgesChange(changes); setSaved(false); }} onConnect={(connection) => { store.connect(connection); setSaved(false); }} onNodeClick={selectNode} onPaneClick={() => store.selectNode(null)} fitView fitViewOptions={{ padding: .22 }} snapToGrid snapGrid={[20, 20]} deleteKeyCode={['Backspace', 'Delete']} multiSelectionKeyCode="Shift" selectionKeyCode="Shift" colorMode="light" minZoom={0.25} maxZoom={1.8}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#cbd5cf" /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor="#7da991" maskColor="rgba(245,247,246,.72)" /><Panel position="top-right"><div className="layout-tools"><select aria-label="Layout direction" value={layoutDirection} onChange={(event) => setLayoutDirection(event.target.value as 'LR' | 'TB')}><option value="LR">Horizontal</option><option value="TB">Vertical</option></select><button className="canvas-tool" onClick={() => store.autoLayout(layoutDirection)}><LayoutDashboard size={15} /> Auto-layout</button></div></Panel><Panel position="bottom-center"><ValidationPanel result={validation} onFocusNode={(domainNodeId) => { const visual = store.nodes.find((node) => node.data.domainNodeId === domainNodeId); if (visual) store.selectNode(visual.id); }} /></Panel>
        </ReactFlow>}
      </section>
      {view === 'automation' ? <NodeConfigurationPanel plan={plan} /> : <aside className="node-config view-summary"><span>{view === 'business' ? 'Business flow' : view === 'implementation' ? 'Developer view' : 'Client handoff'}</span><p>{view === 'business' ? 'This view simplifies technical steps for client discussion. Switch to Automation to edit nodes and connections.' : view === 'implementation' ? 'Application, operation, credential, and limitation guidance for the selected workflow.' : 'Resolve blocking readiness items before exporting to a client.'}</p><strong>{activeWorkflow.nodes.length} synchronized steps</strong><ReadinessBadge readiness={readiness} /></aside>}
    </div>
    {assistantOpen && <AssistantPanel projectId={project.id} workflow={currentWorkflow} selectedNodeId={selectedDomainNodeId} onClose={() => setAssistantOpen(false)} onApply={(proposal) => { store.applyProposedWorkflow(proposal.proposedWorkflow); setAssistantOpen(false); setSaved(false); }} />}
    {comparisonOpen && <ComparisonExportPanel workflow={activeWorkflow} platform={targetPlatform} canvasId="workflow-canvas-export" nodes={visibleNodes} onClose={() => setComparisonOpen(false)} />}
  </div>;
}
