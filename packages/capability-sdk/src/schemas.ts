import { z } from 'zod';
import { CAPABILITY_SDK_SCHEMA_VERSION, capabilityCanonicalFunctionIds } from './contracts.js';

const idSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const semverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const dateSchema = z.string().date();
const cardinalitySchema = z.enum(['single', 'collection']);
const canonicalFunctionSchema = z.enum(capabilityCanonicalFunctionIds);
const documentationEntrySchema = z.object({ id: idSchema, title: z.string().min(1), summary: z.string(), url: z.string().url().nullable(), source: z.enum(['official', 'platform', 'internal_verified']), lastVerifiedAt: dateSchema.nullable() }).strict();
const fieldSchema = z.object({ key: idSchema, label: z.string().min(1), dataType: z.enum(['string', 'number', 'boolean', 'date', 'object', 'array', 'unknown']), required: z.boolean(), nullable: z.boolean(), description: z.string().min(1), cardinality: cardinalitySchema, sensitive: z.boolean() }).strict();
const batchSchema = z.object({ supported: z.boolean(), maximumItems: z.number().int().positive().nullable(), behavior: z.enum(['single_request', 'platform_items', 'iterator_required', 'unknown']) }).strict();
const lifecycleSchema = z.object({ status: z.enum(['active', 'deprecated']), replacedBy: idSchema.nullable() }).strict();
const base = {
  id: idSchema, title: z.string().min(1), purpose: z.string().min(1), canonicalFunctionId: canonicalFunctionSchema,
  inputs: z.array(fieldSchema), outputs: z.array(fieldSchema), acceptedInputCardinality: z.array(cardinalitySchema).min(1),
  producedOutputCardinality: cardinalitySchema, batchSupport: batchSchema, prerequisiteOperationIds: z.array(idSchema),
  limitationRefs: z.array(idSchema), documentationRefs: z.array(idSchema), commonPreviousFunctions: z.array(canonicalFunctionSchema),
  commonNextFunctions: z.array(canonicalFunctionSchema), commonMistakes: z.array(z.string().min(1)), lifecycle: lifecycleSchema,
};
const triggerSchema = z.object({ ...base, kind: z.literal('trigger'), delivery: z.enum(['instant', 'polling', 'scheduled', 'unknown']), deduplicationKey: z.string().nullable() }).strict();
const actionSchema = z.object({ ...base, kind: z.literal('action'), idempotency: z.enum(['native', 'caller_required', 'not_supported', 'unknown']), sideEffect: z.literal(true) }).strict();
const searchSchema = z.object({ ...base, kind: z.literal('search'), resultMode: z.enum(['zero_or_one', 'collection', 'paginated_collection']), pagination: z.object({ mode: z.enum(['cursor', 'page', 'offset', 'unknown']), maximumPageSize: z.number().int().positive().nullable() }).strict().nullable() }).strict();
const webhookSchema = z.object({ ...base, kind: z.literal('webhook'), direction: z.enum(['inbound', 'outbound']), verification: z.enum(['signature', 'token', 'none', 'unknown']), eventType: z.string().min(1) }).strict();
const limitationSchema = z.object({ id: idSchema, severity: z.enum(['info', 'warning', 'blocking']), scope: z.enum(['application', 'authentication', 'operation', 'platform']), summary: z.string().min(1), detail: z.string().min(1), alternative: z.string().nullable(), documentationRefs: z.array(idSchema) }).strict();
const mappingSchema = z.object({
  operationRef: idSchema, platform: z.enum(['zapier', 'make', 'n8n']), support: z.enum(['native', 'workaround', 'unsupported', 'unknown']),
  connector: z.object({ app: z.string().min(1), component: z.string().min(1), eventOrOperation: z.string().min(1) }).strict().nullable(),
  credentialType: z.string().nullable(), limitationRefs: z.array(idSchema), alternative: z.string().nullable(),
  evidence: z.object({ verification: z.enum(['verified', 'unverified', 'deprecated']), sourceType: z.enum(['official_documentation', 'connector_catalog', 'manual_test']), sourceUrl: z.string().url().nullable(), verifiedAt: dateSchema.nullable(), connectorVersion: z.string().nullable() }).strict(),
}).strict();

export const applicationCapabilityPackSchema = z.object({
  schemaVersion: z.literal(CAPABILITY_SDK_SCHEMA_VERSION), packId: idSchema, packVersion: semverSchema, catalogCompatibility: z.string().min(1),
  application: z.object({ id: idSchema, name: z.string().min(1), aliases: z.array(z.string().min(1)), category: idSchema, iconKey: idSchema, website: z.string().url().nullable() }).strict(),
  authentication: z.array(z.object({ id: idSchema, type: z.enum(['oauth2', 'access_token', 'api_key', 'basic', 'custom', 'none', 'unknown']), scopes: z.array(z.string()), description: z.string().min(1), documentationRefs: z.array(idSchema) }).strict()),
  triggers: z.array(triggerSchema), actions: z.array(actionSchema), searches: z.array(searchSchema), webhooks: z.array(webhookSchema), limitations: z.array(limitationSchema),
  documentation: z.object({ overview: documentationEntrySchema, authentication: z.array(documentationEntrySchema), operations: z.array(documentationEntrySchema), rateLimits: z.array(documentationEntrySchema), pagination: z.array(documentationEntrySchema), webhooks: z.array(documentationEntrySchema), errorHandling: z.array(documentationEntrySchema) }).strict(),
  platformMappings: z.array(mappingSchema),
  provenance: z.object({ maintainer: z.string().min(1), license: z.string().min(1), sourceRepository: z.string().url().nullable(), reviewedAt: dateSchema, contentHash: z.string().min(1) }).strict(),
}).strict();
