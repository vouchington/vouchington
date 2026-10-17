import { getRssFeedAutoUpdaterUserId } from '@services/users/system-users'
import type { PrivateUser } from '@services/users/types'
import { read, type QueryOptions, type TransactionQuery } from '@data-stores/psql'
import { insertRssFeedStateChanges, type RssFeedStateKind } from './state-changes.mts'
import { setRssFeedStatesAsCurrentUser } from './set-states-as-current-user.mts'
import { recordRssFeedStatePublicationChange } from './publication-change.mts'
import { lockPostPublicationScope } from '@services/post-publication/lock'
import { applyCommittedRssFeedStateChangeEffects } from './state-effects.mts'
import { runRssFeedStateTransaction } from './state-transaction.mts'
type ChangeKind = RssFeedStateKind
type SetStateResult = 'updated' | 'noop' | 'skipped:human-locked'
type RssFeedStateChange = {
  id: string
  rss_feed_id: string
  is_enabled: boolean
  changed_by_id: string | null
  reason: string | null
  created_at: Date
}
type SetRssFeedStateInput = {
  rssFeedId: string
  is_enabled: boolean
  reason?: string | null
}
type SetRssFeedStateAsSystemInput = SetRssFeedStateInput & {
  overrideHumanLock?: boolean
}

async function getLatestChange(
  kind: ChangeKind,
  rssFeedId: string,
  options: QueryOptions = {},
): Promise<RssFeedStateChange | null> {
  const { rows } = await read(
    `/* getLatestRssFeedStateChange */
      SELECT id, rss_feed_id, is_enabled, changed_by_id, reason, created_at
      FROM rss_feed_setting_changes
      WHERE rss_feed_id = $1 AND change_type = $2
      ORDER BY id DESC
      LIMIT 1`,
    [rssFeedId, kind],
    options,
  )
  return (rows[0] as RssFeedStateChange | undefined) ?? null
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
async function setStateAsCurrentUser(
  kind: ChangeKind,
  currentUser: PrivateUser,
  input: SetRssFeedStateInput,
  options: QueryOptions = {},
): Promise<SetStateResult> {
  return setRssFeedStatesAsCurrentUser(
    currentUser,
    input.rssFeedId,
    [{ kind, is_enabled: input.is_enabled, reason: input.reason }],
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
/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review.
 * Evidence: `docs/overview/architecture/services/README.md`.
 */
export function getLatestDiscoverabilityChange(
  rssFeedId: string,
  options?: QueryOptions,
): Promise<RssFeedStateChange | null> {
  return getLatestChange('discoverability', rssFeedId, options)
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/README.md`.
 */
export function getLatestEnablementChange(
  rssFeedId: string,
  options?: QueryOptions,
): Promise<RssFeedStateChange | null> {
  return getLatestChange('enablement', rssFeedId, options)
}
export function setRssFeedDiscoverabilityAsCurrentUser(
  currentUser: PrivateUser,
  input: SetRssFeedStateInput,
  options?: QueryOptions,
): Promise<SetStateResult> {
  return setStateAsCurrentUser('discoverability', currentUser, input, options)
}
export function setRssFeedEnablementAsCurrentUser(
  currentUser: PrivateUser,
  input: SetRssFeedStateInput,
  options?: QueryOptions,
): Promise<SetStateResult> {
  return setStateAsCurrentUser('enablement', currentUser, input, options)
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
