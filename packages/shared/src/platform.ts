import type { CanonicalWorkflow, Platform, PlatformWorkflow } from './domain.js';

export interface PlatformValidationIssue {
  severity: 'error' | 'warning' | 'recommendation';
  code: string;
  message: string;
  nodeId?: string;
}

export interface PlatformNodeDefinition {
  type: string;
  label: string;
  category: string;
  capabilities: string[];
  appName: string;
  events: string[];
  credentialType: string | null;
  requiredInputs: string[];
  expectedOutputs: string[];
  limitations: string[];
}

export interface PlatformNode {
  id: string;
  sourceNodeId: string;
  stepNumber: number;
  type: string;
  stepType: string;
  appName: string;
  event: string;
  resource: string | null;
  inputFields: string[];
  outputFields: string[];
  mappingNotes: string[];
  configurationNotes: string[];
  requiredCredentials: string[];
  limitations: string[];
  implementationSteps: string[];
  alternatives: string[];
  decisionsRequired: string[];
}

export interface PlatformConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  condition: string | null;
  mappings: Array<{ sourceField: string; destinationField: string; transformation: string | null }>;
}

export interface PlatformBuildPlan extends PlatformWorkflow<PlatformNode, PlatformConnection> {
  platformName: string;
  workflowName: string;
  architectureNotes: string[];
  usageEstimate: 'low' | 'medium' | 'high';
  validationIssues: PlatformValidationIssue[];
}

export interface PlatformAdapter<TWorkflow extends PlatformWorkflow = PlatformWorkflow> {
  readonly platform: Platform;
  readonly displayName: string;
  getNodeCatalog(): readonly PlatformNodeDefinition[];
  transform(workflow: CanonicalWorkflow): TWorkflow;
  validate(workflow: TWorkflow): PlatformValidationIssue[];
  estimateUsage(workflow: TWorkflow): 'low' | 'medium' | 'high';
}

export interface PlatformAdapterRegistry {
  get(platform: Platform): PlatformAdapter;
  list(): readonly PlatformAdapter[];
}
