import { getRssFeedAutoUpdaterUserId } from '@services/users/system-users'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql'
import { insertRssFeedStateChanges, type RssFeedStateKind } from './state-changes.mts'
import { recordRssFeedStatePublicationChange } from './publication-change.mts'
import { lockPostPublicationScope } from '@services/post-publication/lock'
import { applyCommittedRssFeedStateChangeEffects } from './state-effects.mts'
import { runRssFeedStateTransaction } from './state-transaction.mts'
type ChangeKind = RssFeedStateKind
type SetStateResult = 'updated' | 'noop' | 'skipped:human-locked'
type SetRssFeedStateInput = {
  rssFeedId: string
  is_enabled: boolean
  reason?: string | null
}
type SetRssFeedStateAsSystemInput = SetRssFeedStateInput & {
  overrideHumanLock?: boolean
}

async function insertChange(
  kind: ChangeKind,
  input: SetRssFeedStateInput & { createdById: string | null },
  options: QueryOptions = {},
): Promise<void> {
  await insertRssFeedStateChanges(
    input.rssFeedId,
    [{ kind, is_enabled: input.is_enabled, reason: input.reason }],
    input.createdById,
    options,
  )
}
async function setStateAsSystem(
  kind: ChangeKind,
  input: SetRssFeedStateAsSystemInput,
  options: QueryOptions = {},
): Promise<SetStateResult> {
  const systemUserId = await getRssFeedAutoUpdaterUserId()
  const { overrideHumanLock, ...changeInput } = input
  const run = async (query: TransactionQuery): Promise<SetStateResult> => {
    await lockPostPublicationScope(query, { type: 'rss_feed', rssFeedId: input.rssFeedId })
    const { rows } = await query(
      `/* setRssFeedStateAsSystem:latest */
        SELECT is_enabled, changed_by_id
        FROM rss_feed_setting_changes
        WHERE rss_feed_id = $1 AND change_type = $2
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [input.rssFeedId, kind],
    )
    const latest = rows[0] as { is_enabled: boolean; changed_by_id: string | null } | undefined
    if (!overrideHumanLock && latest?.changed_by_id && latest.changed_by_id !== systemUserId)
      return 'skipped:human-locked'
    if (latest?.is_enabled === input.is_enabled) return 'noop'
    await insertChange(kind, { ...changeInput, createdById: systemUserId }, { query })
    await recordRssFeedStatePublicationChange(query, input.rssFeedId, kind)
    return 'updated'
  }
  const result = await runRssFeedStateTransaction(options, run)
  await applyCommittedRssFeedStateChangeEffects(input.rssFeedId, result === 'updated', options)
  return result
}
export function setRssFeedDiscoverabilityAsSystem(
  input: SetRssFeedStateAsSystemInput,
  options?: QueryOptions,
): Promise<SetStateResult> {
  return setStateAsSystem('discoverability', input, options)
}
export function setRssFeedEnablementAsSystem(
  input: SetRssFeedStateAsSystemInput,
  options?: QueryOptions,
): Promise<SetStateResult> {
  return setStateAsSystem('enablement', input, options)
}
export async function createInitialRssFeedStateChanges(
  rssFeedId: string,
  options: QueryOptions = {},
): Promise<void> {
  const systemUserId = await getRssFeedAutoUpdaterUserId()
  await insertRssFeedStateChanges(
    rssFeedId,
    [
      { kind: 'enablement', is_enabled: true, reason: 'initial state' },
      { kind: 'discoverability', is_enabled: true, reason: 'initial state' },
    ],
    systemUserId,
    options,
  )
}
