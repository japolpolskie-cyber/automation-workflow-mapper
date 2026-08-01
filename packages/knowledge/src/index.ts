import { applicationPacks, getApplicationPack, getOperation } from './application-packs.js';
import { canonicalFunctionRegistry, getCanonicalFunction } from './canonical-registry.js';
import { platformCapabilities } from './platform-capabilities.js';
import { KNOWLEDGE_CATALOG_VERSION, type KnowledgeCatalog } from './types.js';

export * from './types.js';
export * from './canonical-registry.js';
export * from './application-packs.js';
export * from './platform-capabilities.js';
export * from './patterns.js';
export * from './platform-node-knowledge.js';
export * from './node-function-catalog.js';

export const knowledgeCatalog: KnowledgeCatalog = {
  version: KNOWLEDGE_CATALOG_VERSION,
  canonicalFunctions: canonicalFunctionRegistry,
  applications: applicationPacks,
  platformCapabilities,
  getCanonicalFunction,
  getApplication: getApplicationPack,
  getOperation,
};
