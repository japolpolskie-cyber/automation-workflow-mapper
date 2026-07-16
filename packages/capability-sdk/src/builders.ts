import type { ApplicationCapabilityPack, CapabilityField } from './contracts.js';
import { CapabilityPackValidationError, validateApplicationCapabilityPack } from './validation.js';

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
export function defineApplicationCapabilityPack(input: ApplicationCapabilityPack): Readonly<ApplicationCapabilityPack> {
  const result = validateApplicationCapabilityPack(input);
  if (!result.valid) throw new CapabilityPackValidationError(result.issues);
  return deepFreeze(structuredClone(input));
}
export function capabilityField(key: string, label: string, dataType: CapabilityField['dataType'], description: string, options: Partial<Pick<CapabilityField, 'required' | 'nullable' | 'cardinality' | 'sensitive'>> = {}): CapabilityField {
  return { key, label, dataType, description, required: options.required ?? true, nullable: options.nullable ?? false, cardinality: options.cardinality ?? 'single', sensitive: options.sensitive ?? false };
}
