import type { PrivateUser } from '@services/users/types'

export type DynamicConfigFieldType = 'boolean' | 'number' | 'string'
export type DynamicConfigFieldValue = boolean | number | string
export type DynamicConfigFields = Record<string, DynamicConfigFieldValue>

export type DynamicConfigNamespaceSummary = {
  namespace: string
  label: string
  description: string
  field_count: number
  can_view: boolean
  can_update: boolean
}

export type DynamicConfigNamespace = DynamicConfigNamespaceSummary & {
  config: DynamicConfigFields
  fields: DynamicConfigFieldMetadata[]
}

export type DynamicConfigFieldMetadata = {
  name: string
  type: DynamicConfigFieldType
  value: DynamicConfigFieldValue
  default_value: DynamicConfigFieldValue | null
  description: string
  min_value?: number
  max_value?: number
  max_value_exemption?: string
  integer?: boolean
}

export type DynamicConfigHistoryEntry = {
  id: string
  namespace: string
  changed_by: {
    id: string
    username: string | null
  } | null
  previous_fields: Record<string, unknown>
  next_fields: Record<string, unknown>
  changed_fields: Record<string, { previous: unknown; next: unknown }>
  created_at: string
}

export type DynamicConfigPermission = 'view' | 'update'

export type DynamicConfigAccess = {
  update_roles: string[]
}

export type DynamicConfigRegistryEntry = {
  namespace: string
  label: string
  description: string
  config: DynamicConfigLike
  access: DynamicConfigAccess
  fields: Record<
    string,
    Partial<Omit<DynamicConfigFieldMetadata, 'default_value' | 'name' | 'type' | 'value'>>
  >
  validate?: (next: DynamicConfigFields) => void
}

export type DynamicConfigLike = {
  key: string
  fieldTypes: Record<string, DynamicConfigFieldType>
  defaultFields: DynamicConfigFields
  fields: Map<string, DynamicConfigFieldValue>
  waitForInitialization(): Promise<void>
  close(): Promise<void>
  getFields(): DynamicConfigFields
  setFields(fields: DynamicConfigFields): Promise<void>
}

export type DynamicConfigUpdateResult = {
  namespace: DynamicConfigNamespace
  changed: boolean
}

export type DynamicConfigUser = Pick<PrivateUser, 'id' | 'roles'>
