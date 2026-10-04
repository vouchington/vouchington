import { getRssFeedAutoUpdaterUserId } from '@services/users/system-users'
import type { PrivateUser } from '@services/users/types'
import { read, write, type QueryOptions, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import {
  currentUserCanModifyRssFeedDiscoverability,
  currentUserCanModifyRssFeedEnablement,
} from './authorization.mts'
import { recordRssFeedStatePublicationChange } from './publication-change.mts'
import { lockPostPublicationScope } from '@services/post-publication/lock'
import { applyCommittedRssFeedStateChangeEffects } from './state-effects.mts'
import { runRssFeedStateTransaction } from './state-transaction.mts'
type ChangeKind = 'discoverability' | 'enablement'
type SetStateResult = 'updated' | 'noop' | 'skipped:human-locked'
type RssFeedStateChange = {
  id: string
  rss_feed_id: string
  enabled: boolean
  changed_by_id: string | null
  reason: string | null
  created_at: Date
}
type SetRssFeedStateInput = {
  rssFeedId: string
  enabled: boolean
  reason?: string | null
}
type SetRssFeedStateAsSystemInput = SetRssFeedStateInput & {
  overrideHumanLock?: boolean
}

function assertReason(reason: string | null | undefined): void {
  assert(reason === undefined || reason === null || reason.length <= 1000, 400, 'reason too long')
}
async function getLatestChange(
  kind: ChangeKind,
  rssFeedId: string,
  options: QueryOptions = {},
): Promise<RssFeedStateChange | null> {
  const { rows } = await read(
    `/* getLatestRssFeedStateChange */
      SELECT id, rss_feed_id, enabled, changed_by_id, reason, created_at
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
  assertReason(input.reason)
  const query = `/* insertRssFeedSettingChange */
    INSERT INTO rss_feed_setting_changes (rss_feed_id, enabled, changed_by_id, reason, change_type)
    VALUES ($1, $2, $3, $4, $5)`
  await write(
    query,
    [input.rssFeedId, input.enabled, input.createdById, input.reason ?? null, kind],
    options,
  )
}
async function setStateAsCurrentUser(
  kind: ChangeKind,
  currentUser: PrivateUser,
  input: SetRssFeedStateInput,
  options: QueryOptions = {},
): Promise<SetStateResult> {
  const canModify =
    kind === 'discoverability'
      ? currentUserCanModifyRssFeedDiscoverability(currentUser)
      : currentUserCanModifyRssFeedEnablement(currentUser)
  assert(canModify, 403, 'Forbidden')
  const run = async (query: TransactionQuery): Promise<SetStateResult> => {
    await lockPostPublicationScope(query, { type: 'rss_feed', rssFeedId: input.rssFeedId })
    const { rows } = await query(
      `/* setRssFeedStateAsCurrentUser:latest */
        SELECT enabled
        FROM rss_feed_setting_changes
        WHERE rss_feed_id = $1 AND change_type = $2
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [input.rssFeedId, kind],
    )
    const latest = rows[0] as { enabled: boolean } | undefined
    if (latest?.enabled === input.enabled) return 'noop'
    await insertChange(kind, { ...input, createdById: currentUser.id }, { query })
    await recordRssFeedStatePublicationChange(query, input.rssFeedId, kind)
    return 'updated'
  }
  const result = await runRssFeedStateTransaction(options, run)
  await applyCommittedRssFeedStateChangeEffects(input.rssFeedId, result === 'updated', options)
  return result
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
        SELECT enabled, changed_by_id
        FROM rss_feed_setting_changes
        WHERE rss_feed_id = $1 AND change_type = $2
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [input.rssFeedId, kind],
    )
    const latest = rows[0] as { enabled: boolean; changed_by_id: string | null } | undefined
    if (!overrideHumanLock && latest?.changed_by_id && latest.changed_by_id !== systemUserId)
      return 'skipped:human-locked'
    if (latest?.enabled === input.enabled) return 'noop'
    await insertChange(kind, { ...changeInput, createdById: systemUserId }, { query })
    await recordRssFeedStatePublicationChange(query, input.rssFeedId, kind)
    return 'updated'
  }
  const result = await runRssFeedStateTransaction(options, run)
  await applyCommittedRssFeedStateChangeEffects(input.rssFeedId, result === 'updated', options)
  return result
}
export function getLatestDiscoverabilityChange(
  rssFeedId: string,
  options?: QueryOptions,
): Promise<RssFeedStateChange | null> {
  return getLatestChange('discoverability', rssFeedId, options)
}

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
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  const systemUserId = await getRssFeedAutoUpdaterUserId()
  await insertChange(
    'enablement',
    { rssFeedId, enabled: true, createdById: systemUserId, reason: 'initial state' },
    options,
  )
  await insertChange(
    'discoverability',
    { rssFeedId, enabled: true, createdById: systemUserId, reason: 'initial state' },
    options,
  )
}
