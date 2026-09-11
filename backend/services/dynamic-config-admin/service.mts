import { read } from '@data-stores/psql'
import { recordDynamicConfigChange } from '@services/dynamic-config-audit'
import sql from 'sql-template-strings'
import { currentUserCanAccessDynamicConfigNamespace } from './authorization.mts'
import {
  assertPlainChanges,
  normalizeFields,
  toNamespace,
  toNamespaceSummary,
  validateChanges,
} from './namespace.mts'
import { dynamicConfigRegistry, getDynamicConfigRegistryEntry } from './registry.mts'
import type {
  DynamicConfigHistoryEntry,
  DynamicConfigNamespace,
  DynamicConfigNamespaceSummary,
  DynamicConfigUpdateResult,
  DynamicConfigUser,
} from './types.mts'

export function listDynamicConfigNamespaces(
  currentUser: DynamicConfigUser,
): DynamicConfigNamespaceSummary[] {
  const summaries = dynamicConfigRegistry.map(entry => toNamespaceSummary(currentUser, entry))
  return summaries.filter(summary => summary.can_view)
}

export async function getDynamicConfigNamespace(
  currentUser: DynamicConfigUser,
  namespace: string,
): Promise<DynamicConfigNamespace | null> {
  const entry = getDynamicConfigRegistryEntry(namespace)
  if (!entry || !currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'view')) {
    return null
  }

  await entry.config.waitForInitialization()
  return toNamespace(currentUser, entry)
}

export async function updateDynamicConfigNamespace(
  currentUser: DynamicConfigUser,
  namespace: string,
  changes: Record<string, unknown>,
): Promise<DynamicConfigUpdateResult | null> {
  const entry = getDynamicConfigRegistryEntry(namespace)
  if (!entry || !currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'update')) {
    return null
  }

  assertPlainChanges(changes)
  await entry.config.waitForInitialization()
  const previous = normalizeFields(entry, entry.config.getFields())
  const validatedChanges = validateChanges(entry, previous, changes)
  const next = { ...previous, ...validatedChanges }
  if (entry.validate) entry.validate(next)

  const changed = Object.entries(validatedChanges).some(([key, value]) => previous[key] !== value)
  if (changed) {
    await recordDynamicConfigChange(currentUser.id, entry.namespace, previous, next)
    await entry.config.setFields(validatedChanges)
  }

  return {
    changed,
    namespace: toNamespace(currentUser, entry),
  }
}

export async function listDynamicConfigNamespaceHistory(
  currentUser: DynamicConfigUser,
  namespace: string,
): Promise<DynamicConfigHistoryEntry[] | null> {
  const entry = getDynamicConfigRegistryEntry(namespace)
  if (!entry || !currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'view')) {
    return null
  }

  const { rows } = await read<{
    id: string
    config_key: string
    changed_by_id: string | null
    changed_by_user_id: string | null
    changed_by_username: string | null
    previous_fields: Record<string, unknown> | null
    next_fields: Record<string, unknown> | null
    created_at: Date
  }>(sql`/* listDynamicConfigNamespaceHistory */
    SELECT
      dcl.id,
      dcl.config_key,
      dcl.changed_by_id,
      users.id AS changed_by_user_id,
      users.username AS changed_by_username,
      dcl.previous_fields,
      dcl.next_fields,
      dcl.created_at
    FROM dynamic_config_change_logs dcl
    LEFT JOIN users ON users.id = dcl.changed_by_id AND users.deleted_at IS NULL
    WHERE dcl.config_key = ${namespace}
    ORDER BY dcl.id DESC
    LIMIT 50
  `)

  return rows.map(row => {
    const previousFields = row.previous_fields ?? {}
    const nextFields = row.next_fields ?? {}
    return {
      id: row.id,
      namespace: row.config_key,
      changed_by: row.changed_by_user_id
        ? {
            id: row.changed_by_user_id,
            username: row.changed_by_username,
          }
        : null,
      previous_fields: previousFields,
      next_fields: nextFields,
      changed_fields: getChangedFields(previousFields, nextFields),
      created_at: row.created_at.toISOString(),
    }
  })
}

function getChangedFields(
  previousFields: Record<string, unknown> | null | undefined,
  nextFields: Record<string, unknown> | null | undefined,
): Record<string, { previous: unknown; next: unknown }> {
  const changedFields: Record<string, { previous: unknown; next: unknown }> = {}
  const previous = previousFields ?? {}
  const next = nextFields ?? {}
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (previous[key] !== next[key]) {
      changedFields[key] = {
        previous: previous[key],
        next: next[key],
      }
    }
  }
  return changedFields
}
