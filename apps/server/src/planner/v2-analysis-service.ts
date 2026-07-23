import { v21AnalysisArtifactsSchema, type DetectedProcessSummary, type V21AnalysisArtifacts } from '@awm/shared';
import { ControlFlowClassifier } from './control-flow-classifier.js';
import { LifecycleCapabilityGrouper } from './lifecycle-capability-grouper.js';
import { RequirementAnalysisNormalizer } from './requirement-analysis-normalizer.js';
import { SemanticRequirementAnalyzer } from '../analysis/semantic-requirement-analyzer.js';

export class V21AnalysisService {
  public constructor(
    private readonly normalizer = new RequirementAnalysisNormalizer(),
    private readonly grouper = new LifecycleCapabilityGrouper(),
    private readonly classifier = new ControlFlowClassifier(),
    private readonly semanticAnalyzer = new SemanticRequirementAnalyzer(),
  ) {}

  public analyze(scope: string, analysis: DetectedProcessSummary): V21AnalysisArtifacts {
    const requirementAnalysis = this.normalizer.normalize(scope, analysis);
    return v21AnalysisArtifactsSchema.parse({
      version: '2.1',
      shadowMode: true,
      semanticAnalysis: this.semanticAnalyzer.analyze(scope),
      requirementAnalysis,
      capabilityGroups: this.grouper.group(analysis, requirementAnalysis),
      controlFlow: this.classifier.classify(scope, analysis),
    });
  }
}
