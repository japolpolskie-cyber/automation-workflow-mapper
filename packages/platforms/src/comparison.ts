import { validateWorkflow, type CanonicalWorkflow, type Platform } from '@awm/shared';
import { buildPlatformPlan } from './index.js';

export interface PlatformComparisonEntry { platform: Platform; platformName: string; score: number; steps: number; branches: number; complexity: string; usage: 'low' | 'medium' | 'high'; maintainability: 'high' | 'medium' | 'low'; flexibility: 'high' | 'medium' | 'low'; skillRequired: 'beginner' | 'intermediate' | 'advanced'; validationErrors: number; validationWarnings: number; reasons: string[] }
export interface PlatformComparison { recommendedPlatform: Platform; recommendationReasons: string[]; entries: PlatformComparisonEntry[] }

export function comparePlatforms(workflow: CanonicalWorkflow): PlatformComparison {
  const entries = (['zapier', 'make', 'n8n'] as const).map((platform): PlatformComparisonEntry => {
    const plan = buildPlatformPlan(platform, workflow); const validation = validateWorkflow(workflow, platform, plan.validationIssues);
    const branches = workflow.branches.length + workflow.nodes.filter((node) => ['condition', 'router', 'filter'].includes(node.category)).length;
    const technical = workflow.nodes.filter((node) => ['api_request', 'transformation', 'loop', 'sub_workflow'].includes(node.category)).length;
    let score = platform === 'zapier' ? 86 : platform === 'make' ? 80 : 76;
    const reasons: string[] = [];
    if (platform === 'zapier') { score -= Math.max(0, workflow.nodes.length - 10) * 2 + branches * 4 + technical * 3; reasons.push('Strong fit for linear, app-to-app automations and simpler maintenance.'); if (branches > 2) reasons.push('Multiple Paths can become harder to maintain in one Zap.'); }
    if (platform === 'make') { score += Math.min(12, branches * 3) + Math.min(6, technical); reasons.push('Visual routers and filters suit branching scenarios.', 'Good balance between visual design and technical flexibility.'); }
    if (platform === 'n8n') { score += Math.min(16, technical * 3) + Math.min(8, branches * 2); reasons.push('Strong fit for APIs, complex branching, code, and reusable sub-workflows.'); if (!technical) reasons.push('May require more technical setup than this workflow needs.'); }
    score -= validation.issues.filter((issue) => issue.severity === 'error').length * 3;
    return { platform, platformName: plan.platformName, score: Math.max(1, Math.min(100, score)), steps: plan.nodes.length, branches, complexity: validation.complexity, usage: plan.usageEstimate, maintainability: workflow.nodes.length > 25 ? 'low' : workflow.nodes.length > 12 ? 'medium' : 'high', flexibility: platform === 'n8n' ? 'high' : platform === 'make' ? 'high' : branches > 2 ? 'medium' : 'high', skillRequired: platform === 'zapier' ? 'beginner' : platform === 'make' ? 'intermediate' : 'advanced', validationErrors: validation.issues.filter((issue) => issue.severity === 'error').length, validationWarnings: validation.issues.filter((issue) => issue.severity === 'warning').length, reasons };
  }).sort((a, b) => b.score - a.score);
  return { recommendedPlatform: entries[0]!.platform, recommendationReasons: entries[0]!.reasons, entries };
}
