'use client'

import { clientApi } from './instance'

export type DynamicConfigFieldType = 'boolean' | 'number' | 'string'
export type DynamicConfigFieldValue = boolean | number | string

export interface DynamicConfigField {
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

export interface DynamicConfigNamespaceSummary {
  namespace: string
  label: string
  description: string
  field_count: number
  can_view: boolean
  can_update: boolean
}

export type DynamicConfigNamespace = DynamicConfigNamespaceSummary & {
  config: Record<string, DynamicConfigFieldValue>
  fields: DynamicConfigField[]
}

export interface DynamicConfigHistoryEntry {
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

export function fetchDynamicConfigNamespaces(): Promise<{
  namespaces: DynamicConfigNamespaceSummary[]
}> {
  return clientApi.get('/api/v1/dynamic-config/namespaces')
}

export function fetchDynamicConfigNamespace(
  namespace: string,
): Promise<{ namespace: DynamicConfigNamespace }> {
  return clientApi.get(`/api/v1/dynamic-config/namespaces/${encodeURIComponent(namespace)}`)
}

export function updateDynamicConfigNamespace(
  namespace: string,
  config: Record<string, DynamicConfigFieldValue>,
): Promise<{ namespace: DynamicConfigNamespace; changed: boolean }> {
  return clientApi.patch(`/api/v1/dynamic-config/namespaces/${encodeURIComponent(namespace)}`, {
    config,
  })
}

export function fetchDynamicConfigNamespaceHistory(
  namespace: string,
): Promise<{ history: DynamicConfigHistoryEntry[] }> {
  return clientApi.get(`/api/v1/dynamic-config/namespaces/${encodeURIComponent(namespace)}/history`)
}
