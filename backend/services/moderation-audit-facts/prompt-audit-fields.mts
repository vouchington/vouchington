const PROMPT_AUDIT_KEYS = [
  'prompt',
  'model_name',
  'model_provider',
  'slot_allocated',
  'on_flag_action',
  'activated_at',
  'deactivated_at',
  'deleted_at',
] as const

const TIMESTAMP_KEYS = new Set(['activated_at', 'deactivated_at', 'deleted_at'])
const ON_FLAG_ACTIONS = new Set(['none', 'unpublish'])

export type PromptAuditKey = (typeof PROMPT_AUDIT_KEYS)[number]

export type PromptAuditSide = {
  has_prompt: boolean
  prompt: string | null
  has_model_name: boolean
  model_name: string | null
  has_model_provider: boolean
  model_provider: string | null
  has_slot_allocated: boolean
  slot_allocated: boolean | null
  has_on_flag_action: boolean
  on_flag_action: string | null
  has_activated_at: boolean
  activated_at: string | null
  has_deactivated_at: boolean
  deactivated_at: string | null
  has_deleted_at: boolean
  deleted_at: string | null
}

export function promptAuditSide(fields: Record<string, unknown>): PromptAuditSide {
  for (const key of Object.keys(fields)) {
    if (!PROMPT_AUDIT_KEYS.includes(key as PromptAuditKey)) {
      throw new Error(`Unknown community agent prompt field: ${key}`)
    }
  }
  return {
    has_prompt: Object.hasOwn(fields, 'prompt'),
    prompt: textValue(fields, 'prompt'),
    has_model_name: Object.hasOwn(fields, 'model_name'),
    model_name: textValue(fields, 'model_name'),
    has_model_provider: Object.hasOwn(fields, 'model_provider'),
    model_provider: textValue(fields, 'model_provider'),
    has_slot_allocated: Object.hasOwn(fields, 'slot_allocated'),
    slot_allocated: booleanValue(fields, 'slot_allocated'),
    has_on_flag_action: Object.hasOwn(fields, 'on_flag_action'),
    on_flag_action: onFlagActionValue(fields),
    has_activated_at: Object.hasOwn(fields, 'activated_at'),
    activated_at: timestampValue(fields, 'activated_at'),
    has_deactivated_at: Object.hasOwn(fields, 'deactivated_at'),
    deactivated_at: timestampValue(fields, 'deactivated_at'),
    has_deleted_at: Object.hasOwn(fields, 'deleted_at'),
    deleted_at: timestampValue(fields, 'deleted_at'),
  }
}

export function promptFieldsFromRow(
  row: Record<string, unknown>,
  side: 'previous' | 'next',
): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const key of PROMPT_AUDIT_KEYS) {
    if (row[`${side}_has_${key}`] !== true) continue
    const value = row[`${side}_${key}`]
    fields[key] =
      TIMESTAMP_KEYS.has(key) && value instanceof Date ? value.toISOString() : (value ?? null)
  }
  return fields
}

export const PROMPT_AUDIT_SELECT = `
  previous_has_prompt, previous_prompt, next_has_prompt, next_prompt,
  previous_has_model_name, previous_model_name, next_has_model_name, next_model_name,
  previous_has_model_provider, previous_model_provider, next_has_model_provider, next_model_provider,
  previous_has_slot_allocated, previous_slot_allocated, next_has_slot_allocated, next_slot_allocated,
  previous_has_on_flag_action, previous_on_flag_action, next_has_on_flag_action, next_on_flag_action,
  previous_has_activated_at, previous_activated_at, next_has_activated_at, next_activated_at,
  previous_has_deactivated_at, previous_deactivated_at, next_has_deactivated_at, next_deactivated_at,
  previous_has_deleted_at, previous_deleted_at, next_has_deleted_at, next_deleted_at
`

function textValue(fields: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(fields, key)) return null
  const value = fields[key]
  if (value === null) return null
  if (typeof value !== 'string') throw new Error(`Invalid community agent prompt field: ${key}`)
  return value
}

function booleanValue(fields: Record<string, unknown>, key: string): boolean | null {
  if (!Object.hasOwn(fields, key)) return null
  const value = fields[key]
  if (value === null) return null
  if (typeof value !== 'boolean') throw new Error(`Invalid community agent prompt field: ${key}`)
  return value
}

function onFlagActionValue(fields: Record<string, unknown>): string | null {
  if (!Object.hasOwn(fields, 'on_flag_action')) return null
  const value = fields.on_flag_action
  if (value === null) return null
  if (typeof value !== 'string' || !ON_FLAG_ACTIONS.has(value)) {
    throw new Error('Invalid community agent prompt field: on_flag_action')
  }
  return value
}

function timestampValue(fields: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(fields, key)) return null
  const value = fields[key]
  if (value === null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value
  throw new Error(`Invalid community agent prompt field: ${key}`)
}
