import {
  validateApplicationCapabilityPack,
  type ApplicationCapability,
  type ApplicationCapabilityPack,
  type CapabilityMatch,
  type CapabilityQuery,
  type PlatformMapping,
} from '@awm/capability-sdk';

const normalize = (value: string): string => value.trim().toLowerCase();
const operations = (pack: ApplicationCapabilityPack): ApplicationCapability[] => [...pack.triggers, ...pack.actions, ...pack.searches, ...pack.webhooks];
const operationKey = (applicationId: string, operationId: string): string => `${applicationId}.${operationId}`;
const mappingKey = (applicationId: string, operationId: string, platform: string): string => `${applicationId}.${operationId}.${platform}`;

export class CapabilityRegistryError extends Error {}

export class DeterministicCapabilityRegistry {
  private readonly packs: readonly ApplicationCapabilityPack[];
  private readonly applicationIndex = new Map<string, ApplicationCapabilityPack>();
  private readonly operationIndex = new Map<string, ApplicationCapability>();
  private readonly mappingIndex = new Map<string, PlatformMapping>();

  public constructor(input: readonly ApplicationCapabilityPack[]) {
    const packs = [...input].sort((left, right) => left.application.id.localeCompare(right.application.id));
    const packIds = new Set<string>();
    for (const pack of packs) {
      const validation = validateApplicationCapabilityPack(pack);
      if (!validation.valid) throw new CapabilityRegistryError(`${pack.packId}: ${validation.issues.map((issue) => issue.code).join(', ')}`);
      if (packIds.has(pack.packId)) throw new CapabilityRegistryError(`Duplicate pack ID: ${pack.packId}`);
      packIds.add(pack.packId);
      for (const alias of [pack.application.id, pack.application.name, ...pack.application.aliases].map(normalize)) {
        const existing = this.applicationIndex.get(alias);
        if (existing && existing.application.id !== pack.application.id) throw new CapabilityRegistryError(`Application alias collision: ${alias}`);
        this.applicationIndex.set(alias, pack);
      }
      for (const operation of operations(pack)) {
        const key = operationKey(pack.application.id, operation.id);
        if (this.operationIndex.has(key)) throw new CapabilityRegistryError(`Duplicate operation ID: ${key}`);
        this.operationIndex.set(key, operation);
      }
      for (const mapping of pack.platformMappings) this.mappingIndex.set(mappingKey(pack.application.id, mapping.operationRef, mapping.platform), mapping);
    }
    this.packs = Object.freeze(packs);
  }

  public listPacks(): readonly ApplicationCapabilityPack[] { return this.packs; }
  public getApplication(idOrAlias: string): ApplicationCapabilityPack | undefined { return this.applicationIndex.get(normalize(idOrAlias)); }
  public getOperation(applicationIdOrAlias: string, operationId: string): ApplicationCapability | undefined {
    const pack = this.getApplication(applicationIdOrAlias);
    return pack ? this.operationIndex.get(operationKey(pack.application.id, operationId)) : undefined;
  }
  public getPlatformMapping(applicationIdOrAlias: string, operationId: string, platform: 'zapier' | 'make' | 'n8n'): PlatformMapping | undefined {
    const pack = this.getApplication(applicationIdOrAlias);
    return pack ? this.mappingIndex.get(mappingKey(pack.application.id, operationId, platform)) : undefined;
  }
  public findOperations(query: CapabilityQuery): readonly CapabilityMatch[] {
    const matches: CapabilityMatch[] = [];
    for (const pack of this.packs) {
      if (query.applicationIds && !query.applicationIds.map(normalize).some((id) => this.getApplication(id)?.application.id === pack.application.id)) continue;
      for (const operation of operations(pack)) {
        if (query.kinds && !query.kinds.includes(operation.kind)) continue;
        if (query.canonicalFunctionIds && !query.canonicalFunctionIds.includes(operation.canonicalFunctionId)) continue;
        if (query.inputCardinality && !operation.acceptedInputCardinality.includes(query.inputCardinality)) continue;
        if (query.outputCardinality && operation.producedOutputCardinality !== query.outputCardinality) continue;
        const platformMapping = query.platform ? this.getPlatformMapping(pack.application.id, operation.id, query.platform) ?? null : null;
        if (query.platform && query.support && (!platformMapping || !query.support.includes(platformMapping.support))) continue;
        matches.push({ application: pack.application, operation, platformMapping });
      }
    }
    return matches.sort((left, right) => `${left.application.id}.${left.operation.kind}.${left.operation.id}`.localeCompare(`${right.application.id}.${right.operation.kind}.${right.operation.id}`)).slice(0, query.limit);
  }
}
