import { currentUserCanAccessDynamicConfigNamespace } from './authorization.mts'
import type {
  DynamicConfigFields,
  DynamicConfigFieldType,
  DynamicConfigNamespace,
  DynamicConfigNamespaceSummary,
  DynamicConfigRegistryEntry,
  DynamicConfigUser,
} from './types.mts'

export class DynamicConfigValidationError extends Error {
  override name = 'DynamicConfigValidationError'
}

export function toNamespaceSummary(
  currentUser: DynamicConfigUser,
  entry: DynamicConfigRegistryEntry,
): DynamicConfigNamespaceSummary {
  return {
    namespace: entry.namespace,
    label: entry.label,
    description: entry.description,
    field_count: Object.keys(entry.config.fieldTypes).length,
    can_view: currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'view'),
    can_update: currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'update'),
  }
}

export function toNamespace(
  currentUser: DynamicConfigUser,
  entry: DynamicConfigRegistryEntry,
): DynamicConfigNamespace {
  const config = normalizeFields(entry, entry.config.getFields())
  return {
    namespace: entry.namespace,
    label: entry.label,
    description: entry.description,
    field_count: Object.keys(entry.config.fieldTypes).length,
    can_view: currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'view'),
    can_update: currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'update'),
    config,
    fields: Object.entries(entry.config.fieldTypes).map(([name, rawType]) => {
      const defaultValue = entry.config.defaultFields[name]
      return {
        name,
        type: toDynamicConfigFieldType(name, rawType),
        value: config[name]!,
        default_value:
          defaultValue === undefined ? null : normalizeFieldValue(name, rawType, defaultValue),
        description: entry.fields[name]?.description ?? humanizeFieldName(name),
        min_value: entry.fields[name]?.min_value,
        max_value: entry.fields[name]?.max_value,
        max_value_exemption: entry.fields[name]?.max_value_exemption,
        integer: entry.fields[name]?.integer,
      }
    }),
  }
}

export function assertPlainChanges(changes: Record<string, unknown>): void {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new DynamicConfigValidationError('Missing config object')
  }
  if (Object.keys(changes).length === 0)
    throw new DynamicConfigValidationError('Config object must not be empty')
}

export function validateChanges(
  entry: DynamicConfigRegistryEntry,
  previous: DynamicConfigFields,
  changes: Record<string, unknown>,
): DynamicConfigFields {
  const validated: DynamicConfigFields = {}
  for (const [name, value] of Object.entries(changes)) {
    const fieldType = entry.config.fieldTypes[name]
    if (!fieldType || !Object.hasOwn(previous, name))
      throw new DynamicConfigValidationError(`Unknown config field: ${name}`)

    if (fieldType === 'boolean') {
      if (typeof value !== 'boolean')
        throw new DynamicConfigValidationError(`Field ${name} must be a boolean`)
      validated[name] = value
      continue
    }
    if (fieldType === 'string') {
      if (typeof value !== 'string')
        throw new DynamicConfigValidationError(`Field ${name} must be a string`)
      validated[name] = value
      continue
    }
    if (fieldType !== 'number')
      throw new DynamicConfigValidationError(`Unsupported config field type: ${fieldType}`)

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DynamicConfigValidationError(`Field ${name} must be a finite number`)
    }
    if (entry.fields[name]?.integer && !Number.isSafeInteger(value)) {
      throw new DynamicConfigValidationError(`Field ${name} must be a safe integer`)
    }
    const minValue = entry.fields[name]?.min_value
    if (minValue !== undefined && value < minValue) {
      throw new DynamicConfigValidationError(
        `Field ${name} must be greater than or equal to ${minValue}`,
      )
    }
    const maxValue = entry.fields[name]?.max_value
    if (maxValue !== undefined && value > maxValue) {
      throw new DynamicConfigValidationError(
        `Field ${name} must be less than or equal to ${maxValue}`,
      )
    }
    validated[name] = value
  }
  return validated
}

export function normalizeFields(
  entry: DynamicConfigRegistryEntry,
  rawFields: Record<string, unknown>,
): DynamicConfigFields {
  const fields: DynamicConfigFields = {}
  for (const [name, type] of Object.entries(entry.config.fieldTypes)) {
    const rawValue = rawFields[name] ?? entry.config.defaultFields[name]
    fields[name] = normalizeFieldValue(name, type, rawValue)
  }
  return fields
}

function normalizeFieldValue(
  name: string,
  rawType: string,
  value: unknown,
): boolean | number | string {
  const type = toDynamicConfigFieldType(name, rawType)
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid number config field ${name}`)
    }
    return value
  }
  if (typeof value !== type) throw new Error(`Invalid ${type} config field ${name}`)
  return value as boolean | string
}

function humanizeFieldName(name: string): string {
  return name.replaceAll('_', ' ')
}

function toDynamicConfigFieldType(name: string, rawType: string): DynamicConfigFieldType {
  if (rawType === 'boolean' || rawType === 'number' || rawType === 'string') return rawType
  throw new Error(`Unsupported dynamic config field type for ${name}: ${rawType}`)
}
