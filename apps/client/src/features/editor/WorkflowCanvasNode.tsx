import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { EditorNode } from './editor-store';
import { ApplicationIcon } from './ApplicationIcon';
import { branchControlFor } from './editor-branches';

export function WorkflowCanvasNode({ data, selected }: NodeProps<EditorNode>) {
  const node = data.node;
  const warning = node.status === 'warning' || node.riskLevel === 'high';
  const inputSummary = node.inputs.length ? node.inputs.slice(0, 2).map((field) => field.label).join(', ') : 'Previous step data';
  const outputSummary = node.outputs.length ? node.outputs.slice(0, 2).map((field) => field.label).join(', ') : node.expectedResult || 'Step result';
  const decision = ['condition', 'filter'].includes(node.category);
  const routes = branchControlFor(node) === 'dynamic'
    ? (data.routeHandles?.length ? data.routeHandles : [{ id: 'route-1', label: data.platform === 'zapier' ? 'Path 1' : data.platform === 'make' ? 'Route 1' : 'Output 1' }]).map((route, index) => ({
        id: route.id,
        label: route.label,
        top: `${((index + 1) / ((data.routeHandles?.length ?? 1) + 1)) * 100}%`,
      }))
    : [];
  const configuredOutputs = Array.isArray(node.configuration.editorFixedOutputs)
    ? node.configuration.editorFixedOutputs.flatMap((output) => output && typeof output === 'object' && typeof (output as Record<string, unknown>).id === 'string' && typeof (output as Record<string, unknown>).label === 'string' ? [{ id: (output as { id: string }).id, label: (output as { label: string }).label, top: '50%', className: (output as { id: string }).id === 'error' ? 'negative' : '' }] : [])
    : [];
  const outcomes = configuredOutputs.length ? configuredOutputs : node.category === 'human_approval'
    ? [{ id: 'approved', label: 'Approved', top: '36%', className: 'positive' }, { id: 'rejected', label: 'Rejected', top: '72%', className: 'negative' }]
    : node.category === 'loop'
      ? [{ id: 'item', label: 'Current item', top: '36%', className: 'positive' }, { id: 'done', label: 'Completed', top: '72%', className: '' }]
      : node.category === 'retry'
        ? [{ id: 'default', label: 'Succeeded', top: '36%', className: 'positive' }, { id: 'exhausted', label: 'Exhausted', top: '72%', className: 'negative' }]
        : [];
  const productStatus = data.productStatus ?? (!node.service || !node.operation ? 'Unresolved' : node.status === 'warning' || node.status === 'incomplete' ? 'Needs Clarification' : 'Supported');
  const custom = node.configuration.manualCustomNode === true;
  return <div className={`workflow-node category-${custom ? 'custom' : node.category} ${selected ? 'selected' : ''}`}>
    {!['trigger', 'start'].includes(node.category) && <Handle type="target" position={Position.Left} className="flow-handle" />}
    <div className="workflow-node-head"><ApplicationIcon icon={node.icon} /><span className="workflow-node-category">{node.service || node.category.replace('_', ' ')}</span>{warning && <AlertTriangle className="node-warning" size={14} />}</div>
    <strong>{node.name}</strong><p className="node-operation">{node.service || 'No application'} · {node.operation || 'Configure operation'}</p><div className={`node-product-status status-${productStatus.toLowerCase().replaceAll(' ', '-')}`}>{productStatus}</div>{data.platformBadges?.length ? <div className="node-platform-badges">{data.platformBadges.map((badge) => <span key={badge}>{badge}</span>)}</div> : null}<p className="node-purpose">{node.purpose || node.description}</p>
    <div className="node-io"><span><b>IN</b>{inputSummary}</span><span><b>OUT</b>{outputSummary}</span></div>
    <div className="node-footer"><small>{node.estimatedExecution}</small><div className="node-completeness"><span style={{ width: `${node.configurationCompleteness}%` }} /><em>{node.configurationCompleteness}%</em>{node.status === 'configured' && <CheckCircle2 size={12} />}</div></div>
    {node.category === 'end' ? null : node.category === 'condition' ? <><Handle id="positive" type="source" position={Position.Right} style={{ top: '36%' }} className="flow-handle positive" title="TRUE" /><Handle id="negative" type="source" position={Position.Right} style={{ top: '72%' }} className="flow-handle negative" title="FALSE" /></> : routes.length ? routes.map((route) => <Handle key={route.id} id={route.id} type="source" position={Position.Right} style={{ top: route.top }} className="flow-handle route" title={route.label} />) : outcomes.length ? outcomes.map((outcome, index) => <Handle key={outcome.id} id={outcome.id} type="source" position={Position.Right} style={{ top: configuredOutputs.length ? `${((index + 1) / (outcomes.length + 1)) * 100}%` : outcome.top }} className={`flow-handle ${outcome.className}`} title={outcome.label} />) : <Handle id="default" type="source" position={Position.Right} className="flow-handle" title={decision ? 'Continue when condition passes' : 'Continue'} />}
  </div>;
}
