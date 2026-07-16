import type { Platform, PlatformAdapterRegistry } from '@awm/shared';
import { CatalogPlatformAdapter } from './adapter.js';
import { makeCatalog, n8nCatalog, zapierCatalog } from './catalogs.js';

export const zapierAdapter = new CatalogPlatformAdapter('zapier', 'Zapier', zapierCatalog, ['Use a mostly linear Zap.', 'Use Paths only for necessary branching.', 'Consider Sub-Zaps when the workflow grows beyond one maintainable automation.']);
export const makeAdapter = new CatalogPlatformAdapter('make', 'Make.com', makeCatalog, ['Use a scenario router for branches.', 'Attach filters to routes.', 'Use error-handler routes for recoverable module failures.']);
export const n8nAdapter = new CatalogPlatformAdapter('n8n', 'n8n', n8nCatalog, ['Use explicit IF or Switch nodes for branching.', 'Use expressions for field mappings.', 'Move reusable logic into sub-workflows when appropriate.']);

const adapters = [zapierAdapter, makeAdapter, n8nAdapter] as const;
export const platformAdapterRegistry: PlatformAdapterRegistry = {
  get(platform: Platform) { const adapter = adapters.find((item) => item.platform === platform); if (!adapter) throw new Error(`Unsupported platform: ${platform}`); return adapter; },
  list() { return adapters; }
};
export function buildPlatformPlan(platform: Platform, workflow: Parameters<typeof zapierAdapter.buildPlan>[0]) { return adapters.find((item) => item.platform === platform)!.buildPlan(workflow); }
export { makeCatalog, n8nCatalog, zapierCatalog } from './catalogs.js';
export * from './comparison.js';
export * from './documentation.js';
