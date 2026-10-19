import type { DynamicConfigChangedFields } from 'valkyries/dynamic-config'
import type { DynamicConfigNamespace } from '@vouchington/dynamic-config'
import type { PrivateUser } from '@services/users/types'

export type DynamicConfigHistoryEntry = {
  id: string
  namespace: string
  changed_by: {
    id: string
    username: string | null
  } | null
  previous_fields: Record<string, unknown>
  next_fields: Record<string, unknown>
  changed_fields: DynamicConfigChangedFields
  created_at: string
}

export type DynamicConfigUser = Pick<PrivateUser, 'id' | 'roles'>

export type DynamicConfigUpdateResult = {
  namespace: DynamicConfigNamespace
  changed: boolean
}
