import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { EditorNode } from './editor-store';
import { ApplicationIcon } from './ApplicationIcon';

export function WorkflowCanvasNode({ data, selected }: NodeProps<EditorNode>) {
  const node = data.node;
  const warning = node.status === 'warning' || node.riskLevel === 'high';
  const inputSummary = node.inputs.length ? node.inputs.slice(0, 2).map((field) => field.label).join(', ') : 'Previous step data';
  const outputSummary = node.outputs.length ? node.outputs.slice(0, 2).map((field) => field.label).join(', ') : node.expectedResult || 'Step result';
  const decision = ['condition', 'filter'].includes(node.category);
  const productStatus = data.productStatus ?? (!node.service || !node.operation ? 'Unresolved' : node.status === 'warning' || node.status === 'incomplete' ? 'Needs Clarification' : 'Supported');
  return <div className={`workflow-node category-${node.category} ${selected ? 'selected' : ''}`}>
    <Handle type="target" position={Position.Left} className="flow-handle" />
    <div className="workflow-node-head"><ApplicationIcon icon={node.icon} /><span className="workflow-node-category">{node.service || node.category.replace('_', ' ')}</span>{warning && <AlertTriangle className="node-warning" size={14} />}</div>
    <strong>{node.name}</strong><p className="node-operation">{node.service || 'No application'} · {node.operation || 'Configure operation'}</p><div className={`node-product-status status-${productStatus.toLowerCase().replaceAll(' ', '-')}`}>{productStatus}</div>{data.platformBadges?.length ? <div className="node-platform-badges">{data.platformBadges.map((badge) => <span key={badge}>{badge}</span>)}</div> : null}<p className="node-purpose">{node.purpose || node.description}</p>
    <div className="node-io"><span><b>IN</b>{inputSummary}</span><span><b>OUT</b>{outputSummary}</span></div>
    <div className="node-footer"><small>{node.estimatedExecution}</small><div className="node-completeness"><span style={{ width: `${node.configurationCompleteness}%` }} /><em>{node.configurationCompleteness}%</em>{node.status === 'configured' && <CheckCircle2 size={12} />}</div></div>
    {decision ? <><Handle id="positive" type="source" position={Position.Right} style={{ top: '36%' }} className="flow-handle positive" /><Handle id="negative" type="source" position={Position.Right} style={{ top: '72%' }} className="flow-handle negative" /></> : <Handle id="default" type="source" position={Position.Right} className="flow-handle" />}
  </div>;
}
