import { generatedCapabilityPacks } from './generated-manifest.js';
import { DeterministicCapabilityRegistry } from './registry.js';

export * from './registry.js';
export * from './generated-manifest.js';

export const capabilityRegistry = new DeterministicCapabilityRegistry(generatedCapabilityPacks);
