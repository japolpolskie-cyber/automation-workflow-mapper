import {
  semanticRequirementAnalysisSchema,
  type SemanticRequirementAnalysis,
  type SemanticRequirementKind,
  type SemanticRequirementUnit,
} from '@awm/shared';

const authoringInstruction = /^(?:please\s+)?(?:create|build|design|generate|return)\s+(?:an?\s+)?(?:complete\s+)?(?:n8n|make(?:\.com)?|zapier|automation|workflow)\b/i;
const authoringConstraint = /^(?:please\s+)?(?:use|avoid|do not|don't|ensure|keep|include|limit|preserve)\b/i;
const trigger = /\b(?:workflow should start when|starts? when|trigger(?:ed)? (?:when|by)|webhook\b|upon receiving|when .* (?:arrives|is received|is submitted))\b/i;
const aiAgent = /\bAI Agent\b/i;
const aiResource = /\b(?:chat model|simple memory|memory|HTTP request tool|vector store(?: tool)?|tool)\b/i;
const router = /\b(?:router|switch)\b/i;
const binaryCondition = /^(?:if|whether)\b|\bIF condition\b/i;
const terminalOutcome = /^(?:finish|end|terminate|complete)\b/i;
const eventWait = /\bwait\s+(?:for|until)\s+(?:an?\s+)?(?:approval|callback|response|signature|payment|status|event)\b/i;
const temporalWait = /\bwait\s+(?:for\s+)?(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:seconds?|minutes?|hours?|days?|weeks?)|until\s+(?:tomorrow|[^.\n]*(?:am|pm|\d{1,2}:\d{2})))\b/i;
const sequence = /^(?:after|continue to|next|then)\b/i;
const operation = /^(?:(?:each route\s+)?(?:receive|analy[sz]e|extract|classify|create|update|send|log|store|retrieve|fetch|notify|assign|generate|process|validate|creates?))\b/i;
const branchMarker = /^(?:[-*]\s*)?(TRUE|FALSE)\s*[:—-]\s*(.+)$/i;
const listItem = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/;

interface ParsedLine {
  text: string;
  content: string;
  start: number;
  end: number;
  isListItem: boolean;
}

export class SemanticRequirementAnalyzer {
  public analyze(scope: string): SemanticRequirementAnalysis {
    const units: SemanticRequirementUnit[] = [];
    let activeAgent: string | null = null;
    let activeRouter: string | null = null;
    let activeCondition: string | null = null;

    for (const line of lines(scope)) {
      const branch = branchMarker.exec(line.text);
      if (branch && activeCondition) {
        const branchUnit = add(units, branch[1]!.toUpperCase() === 'TRUE' ? 'branch' : 'branch', line, true, activeCondition, branch[1]!.toUpperCase() as 'TRUE' | 'FALSE');
        const actionText = branch[2]!.trim();
        if (actionText) add(units, 'operation', { ...line, text: actionText, content: actionText }, true, branchUnit.id);
        continue;
      }

      if (sequence.test(line.content)) {
        add(units, 'sequence', line, false, null);
        if (router.test(line.content)) {
          const unit = add(units, 'router', line, true, null);
          activeRouter = unit.id; activeAgent = null; activeCondition = null;
        } else if (binaryCondition.test(line.content)) {
          const unit = add(units, 'binary-condition', line, true, null);
          activeCondition = unit.id; activeAgent = null; activeRouter = null;
        }
        continue;
      }

      const kind = classify(line, { activeAgent, activeRouter, activeCondition });
      if (!kind) continue;
      const executable = !['authoring-instruction', 'authoring-constraint', 'ai-resource', 'route', 'sequence'].includes(kind);
      const parentId = kind === 'ai-resource' ? activeAgent : kind === 'route' || (kind === 'operation' && /^each route\b/i.test(line.content)) ? activeRouter : null;
      const unit = add(units, kind, line, executable, parentId);

      if (kind === 'ai-agent') { activeAgent = unit.id; activeRouter = null; activeCondition = null; }
      else if (kind === 'router') { activeRouter = unit.id; activeAgent = null; activeCondition = null; }
      else if (kind === 'binary-condition') { activeCondition = unit.id; activeAgent = null; activeRouter = null; }
      else if (!line.isListItem && !['sequence'].includes(kind)) {
        if (kind !== 'ai-resource') activeAgent = null;
        if (kind !== 'route') activeRouter = null;
      }
    }

    return semanticRequirementAnalysisSchema.parse({ version: '1.0', shadowMode: true, units });
  }
}

function classify(line: ParsedLine, context: { activeAgent: string | null; activeRouter: string | null; activeCondition: string | null }): SemanticRequirementKind | null {
  if (authoringInstruction.test(line.content)) return 'authoring-instruction';
  if (aiAgent.test(line.content)) return 'ai-agent';
  if (authoringConstraint.test(line.content)) return 'authoring-constraint';
  if (trigger.test(line.content)) return 'trigger';
  if (eventWait.test(line.content)) return 'event-wait';
  if (temporalWait.test(line.content)) return 'temporal-wait';
  if (sequence.test(line.content)) return 'sequence';
  if (binaryCondition.test(line.content)) return 'binary-condition';
  if (router.test(line.content)) return 'router';
  if (line.isListItem && context.activeAgent && aiResource.test(line.content)) return 'ai-resource';
  if (line.isListItem && context.activeRouter) return 'route';
  if (terminalOutcome.test(line.content)) return 'terminal-outcome';
  if (operation.test(line.content)) return 'operation';
  return null;
}

function add(units: SemanticRequirementUnit[], kind: SemanticRequirementKind, line: ParsedLine, executable: boolean, parentId: string | null, branchLabel: 'TRUE' | 'FALSE' | null = null): SemanticRequirementUnit {
  const unit = {
    id: `semantic-${units.length + 1}`,
    kind,
    text: line.content,
    start: line.start,
    end: line.end,
    executable,
    parentId,
    branchLabel,
  };
  units.push(unit);
  return unit;
}

function lines(scope: string): ParsedLine[] {
  const output: ParsedLine[] = [];
  let offset = 0;
  for (const raw of scope.split(/\r?\n/)) {
    const leading = raw.search(/\S/);
    if (leading >= 0) {
      const text = raw.trim();
      const match = listItem.exec(text);
      const content = (match?.[1] ?? text).trim();
      const contentOffset = text.indexOf(content);
      const start = offset + leading + contentOffset;
      output.push({ text, content, start, end: start + content.length, isListItem: Boolean(match) });
    }
    offset += raw.length + 1;
  }
  return output;
}
