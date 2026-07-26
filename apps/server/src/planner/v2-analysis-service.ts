import { v21AnalysisArtifactsSchema, type DetectedProcessSummary, type V21AnalysisArtifacts } from '@awm/shared';
import { ControlFlowClassifier } from './control-flow-classifier.js';
import { LifecycleCapabilityGrouper } from './lifecycle-capability-grouper.js';
import { ProcessIntelligenceService } from '../process-intelligence/process-intelligence-service.js';

export class V21AnalysisService {
  public constructor(
    private readonly processIntelligence = new ProcessIntelligenceService(),
    private readonly grouper = new LifecycleCapabilityGrouper(),
    private readonly classifier = new ControlFlowClassifier(),
  ) {}

  public analyze(scope: string, analysis: DetectedProcessSummary): V21AnalysisArtifacts {
    const processAnalysis = this.processIntelligence.analyze(scope, analysis);
    const requirementAnalysis = processAnalysis.requirementAnalysis;
    return v21AnalysisArtifactsSchema.parse({
      version: '2.1',
      shadowMode: true,
      processAnalysis,
      semanticAnalysis: processAnalysis.semanticAnalysis,
      requirementAnalysis,
      capabilityGroups: this.grouper.group(analysis, requirementAnalysis),
      controlFlow: this.classifier.classify(scope, analysis),
    });
  }
}
