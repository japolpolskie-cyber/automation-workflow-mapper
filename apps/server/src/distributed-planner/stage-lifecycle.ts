import type { DistributedPlannerStageState } from '@awm/shared';

const transitions: Readonly<Record<DistributedPlannerStageState, readonly DistributedPlannerStageState[]>> = {
  pending: ['ready', 'skipped', 'cancelled', 'blocked-by-clarification'],
  ready: ['running', 'cache-hit', 'skipped', 'cancelled', 'blocked-by-clarification'],
  running: ['succeeded', 'failed', 'timed-out', 'cancelled', 'blocked-by-clarification'],
  succeeded: [],
  failed: [],
  'timed-out': [],
  cancelled: [],
  skipped: [],
  'blocked-by-clarification': [],
  'cache-hit': [],
};

export function canTransitionStage(from: DistributedPlannerStageState, to: DistributedPlannerStageState): boolean {
  return transitions[from].includes(to);
}

export function assertStageTransition(from: DistributedPlannerStageState, to: DistributedPlannerStageState): void {
  if (!canTransitionStage(from, to)) throw new Error(`Invalid distributed planner stage transition: ${from} -> ${to}.`);
}
