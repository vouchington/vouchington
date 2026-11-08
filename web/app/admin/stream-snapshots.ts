import type { CacheGroup, MigrationStatusResponse } from '@/types/api-responses'

export type PostgreSQLStreamSnapshot = MigrationStatusResponse | { error: string }

export interface ValkeySnapshot {
  groups: CacheGroup[] | null
  errors?: {
    groups?: string
  }
}

export function isPostgreSQLStreamSnapshot(value: unknown): value is PostgreSQLStreamSnapshot {
  if (!isRecord(value)) return false
  if ('error' in value) return typeof value.error === 'string'
  return (
    Array.isArray(value.applied) &&
    value.applied.every(entry => typeof entry === 'string') &&
    Array.isArray(value.pending) &&
    value.pending.every(entry => typeof entry === 'string') &&
    typeof value.total === 'number'
  )
}

export function isValkeySnapshot(value: unknown): value is ValkeySnapshot {
  if (!isRecord(value) || !('groups' in value)) return false
  const groups = value.groups
  if (
    groups !== null &&
    (!Array.isArray(groups) ||
      !groups.every(
        group =>
          isRecord(group) &&
          typeof group.name === 'string' &&
          Array.isArray(group.prefixes) &&
          group.prefixes.every(prefix => typeof prefix === 'string'),
      ))
  )
    return false
  if (!('errors' in value)) return true
  if (!isRecord(value.errors)) return false
  return !('groups' in value.errors) || typeof value.errors.groups === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
