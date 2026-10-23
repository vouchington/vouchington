import { read } from '@data-stores/psql'
import {
  normalizeFields,
  toAdminNamespaceSummary,
  toAdminNamespaceView,
  type DynamicConfigNamespace,
  type DynamicConfigNamespaceSummary,
} from '@vouchington/dynamic-config'
import {
  DynamicConfigValidationError,
  getChangedFields,
  validateDynamicConfigUpdate,
} from 'valkyries/dynamic-config'
import { recordDynamicConfigChange } from '@services/dynamic-config-audit'
import { deriveAutomaticWithholdingSince } from '@services/copyright-notices/config'
import sql from 'sql-template-strings'
import { currentUserCanAccessDynamicConfigNamespace } from './authorization.mts'
import { dynamicConfigRegistry } from './registry.mts'
import type {
  DynamicConfigHistoryEntry,
  DynamicConfigUpdateResult,
  DynamicConfigUser,
} from './types.mts'

export function listDynamicConfigNamespaces(
  currentUser: DynamicConfigUser,
): DynamicConfigNamespaceSummary[] {
  return dynamicConfigRegistry.entries.flatMap(entry => {
    const summary = toAdminNamespaceSummary(entry, {
      can_view: currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'view'),
      can_update: currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'update'),
    })
    return summary.can_view ? [summary] : []
  })
}

export async function getDynamicConfigNamespace(
  currentUser: DynamicConfigUser,
  namespace: string,
): Promise<DynamicConfigNamespace | null> {
  const entry = dynamicConfigRegistry.get(namespace)
  if (!entry || !currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'view')) {
    return null
  }

  await entry.config.waitForInitialization()
  return toAdminNamespaceView(entry, {
    can_view: true,
    can_update: currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'update'),
  })
}

export async function updateDynamicConfigNamespace(
  currentUser: DynamicConfigUser,
  namespace: string,
  changes: Record<string, unknown>,
): Promise<DynamicConfigUpdateResult | null> {
  const entry = dynamicConfigRegistry.get(namespace)
  if (!entry || !currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'update')) {
    return null
  }

  await entry.config.waitForInitialization()
  if (namespace === 'copyright' && 'automaticProvisionalWithholdingSince' in changes) {
    throw new DynamicConfigValidationError(
      'automaticProvisionalWithholdingSince is managed by the switch',
    )
  }
  const previous = normalizeFields(entry, entry.config.getFields())
  const validated = validateDynamicConfigUpdate(entry, previous, changes)
  if (validated.changed) {
    const switchOnSince =
      namespace === 'copyright'
        ? deriveAutomaticWithholdingSince(
            previous.automaticProvisionalWithholding,
            validated.next.automaticProvisionalWithholding,
            new Date(),
          )
        : undefined
    const switchChanged = switchOnSince !== undefined
    const next = switchChanged
      ? { ...validated.next, automaticProvisionalWithholdingSince: switchOnSince }
      : validated.next
    await recordDynamicConfigChange(currentUser.id, entry.namespace, previous, next)
    await entry.config.setFields(
      switchChanged
        ? { ...validated.changes, automaticProvisionalWithholdingSince: switchOnSince }
        : validated.changes,
    )
  }

  return {
    changed: validated.changed,
    namespace: toAdminNamespaceView(entry, {
      can_view: true,
      can_update: true,
    }),
  }
}

export async function listDynamicConfigNamespaceHistory(
  currentUser: DynamicConfigUser,
  namespace: string,
): Promise<DynamicConfigHistoryEntry[] | null> {
  const entry = dynamicConfigRegistry.get(namespace)
  if (!entry || !currentUserCanAccessDynamicConfigNamespace(currentUser, entry, 'view')) {
    return null
  }

  const { rows } = await read<{
    id: string
    configuration_key: string
    revised_by_id: string | null
    changed_by_user_id: string | null
    changed_by_username: string | null
    previous_fields: Record<string, unknown> | null
    next_fields: Record<string, unknown> | null
    created_at: Date
  }>(sql`/* listDynamicConfigNamespaceHistory */
    SELECT
      dcl.id,
      dcl.configuration_key,
      dcl.revised_by_id,
      users.id AS changed_by_user_id,
      users.username AS changed_by_username,
      (SELECT COALESCE(jsonb_object_agg(key, value -> 'before'), '{}'::jsonb) FROM jsonb_each(dcl.changes)) AS previous_fields,
      (SELECT COALESCE(jsonb_object_agg(key, value -> 'after'), '{}'::jsonb) FROM jsonb_each(dcl.changes)) AS next_fields,
      dcl.created_at
    FROM dynamic_configuration_revisions dcl
    LEFT JOIN users ON users.id = dcl.revised_by_id AND users.deleted_at IS NULL
    WHERE dcl.configuration_key = ${namespace}
    ORDER BY dcl.id DESC
    -- API/MCP contract: latest 50 audit rows.
    LIMIT 50
  `)

  return rows.map(row => {
    const previousFields = row.previous_fields ?? {}
    const nextFields = row.next_fields ?? {}
    return {
      id: row.id,
      namespace: row.configuration_key,
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
