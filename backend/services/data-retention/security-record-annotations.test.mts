import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import {
  insertSecurityRetentionCredentialFixture,
  positionSecurityRetentionFixture,
} from '@voucha/test-helpers/security-retention-page-fixtures'
import {
  createSecurityRetentionFriendAccount,
  insertSecurityRetentionFriendFixture,
} from '@voucha/test-helpers/security-retention-friend-fixtures'
import { insertTestNativeMintAudit } from '@voucha/test-helpers/entities/oauth-retention-evidence'
import { insertTestRationaleAgePair } from '@voucha/test-helpers/security-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { insertTestCopyrightDecisionRationaleForCase } from '@voucha/test-helpers/data-stores/psql/copyright-decision-rationale'
import { sweepCopyrightEvidenceRetention } from '@services/copyright-notices'
import { cleanupSecuritySourcePageInTransaction } from './security-record-page.mts'
import { sourcePlan, type Source } from './security-record-plans.mts'

const DAY_MS = 86_400_000

// A narrow historical window keeps each cursor page isolated from other parallel fixtures.
function fixtureTime(): Date {
  return new Date(Date.UTC(2000, 0, 1) + randomInt(20 * DAY_MS))
}

async function expectOwnedPageDeletion(
  query: Parameters<typeof cleanupSecuritySourcePageInTransaction>[0],
  source: Source,
  id: string,
  keyAt: Date,
): Promise<{ deleted: number; hasMore: boolean }> {
  const now = new Date(keyAt)
  if (source.startsWith('copyright_')) now.setUTCFullYear(now.getUTCFullYear() + 6)
  else if (source === 'oauth_grant_anchors' || source === 'oauth_native_mints')
    now.setUTCFullYear(now.getUTCFullYear() + 1)
  else now.setTime(now.getTime() + 90 * DAY_MS)
  now.setTime(now.getTime() + 1)
  const cutoffAt = sourcePlan(source, now).cutoffAt
  await positionSecurityRetentionFixture(query, source, id, keyAt)
  const { result, queries } = await withCapturedTestQueries(() =>
    cleanupSecuritySourcePageInTransaction(query, source, 1, now),
  )
  const page = queries.find(entry =>
    entry.text.startsWith(`/* listSecurityRetentionPage:${source} */`),
  )
  const deletion = queries.find(entry =>
    entry.text.startsWith(`/* deleteSecurityRetentionPage:${source} */`),
  )
  expect(page).toBeDefined()
  expect(page?.values.at(-1)).toBe(2)
  expect(deletion).toBeDefined()
  expect(deletion?.values).toEqual(source.startsWith('copyright_') ? [[id], cutoffAt] : [[id]])
  return result
}

describe('security retention statement identity', () => {
  const configure = useCopyrightRetentionConfig()
  useFakeCopyrightEvidenceBucket()

  it.each([
    'oauth_grant_anchors',
    'oauth_clients',
    'api_keys_revoked',
    'api_keys_expired',
  ] as const)('deletes only the owned %s candidate with its existing annotation', async source => {
    const owner = await createTestUser()
    const keyAt = fixtureTime()
    await using query = await beginTransaction()
    const id = await insertSecurityRetentionCredentialFixture(query, source, owner.id, keyAt)
    expect(await expectOwnedPageDeletion(query, source, id, keyAt)).toEqual({
      deleted: 1,
      hasMore: false,
    })
  })

  it.each(['facebook', 'github', 'x'] as const)(
    'keeps the %s friend observation cursor and statement identity',
    async provider => {
      const accountId = await createSecurityRetentionFriendAccount(provider)
      const keyAt = fixtureTime()
      await using query = await beginTransaction()
      const id = await insertSecurityRetentionFriendFixture(query, provider, accountId, keyAt)
      expect(await expectOwnedPageDeletion(query, `${provider}_friends`, id, keyAt)).toEqual({
        deleted: 1,
        hasMore: false,
      })
    },
  )

  it('preserves the native-mint annotation and guarded deletion', async () => {
    const owner = await createTestUser()
    const keyAt = fixtureTime()
    const id = await insertTestNativeMintAudit(owner.id, keyAt)
    await using query = await beginTransaction()
    expect(await expectOwnedPageDeletion(query, 'oauth_native_mints', id, keyAt)).toEqual({
      deleted: 1,
      hasMore: false,
    })
  })

  it('preserves the noncase rationale annotation and calendar-year cutoff bind', async () => {
    const owner = await createTestUser()
    const actor = await createTestUser({ administrator: true })
    const keyAt = fixtureTime()
    await using query = await beginTransaction()
    const [id] = await insertTestRationaleAgePair(
      query,
      owner.id,
      actor.id,
      keyAt,
      new Date(keyAt.getTime() + DAY_MS),
    )
    expect(await expectOwnedPageDeletion(query, 'copyright_rationales_noncase', id, keyAt)).toEqual(
      { deleted: 1, hasMore: false },
    )
  })

  it('retires an aged case rationale only after real production erasure', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const entry = await createRetentionMinimalCase()
    const keyAt = fixtureTime()
    const id = await insertTestCopyrightDecisionRationaleForCase(
      entry.noticeId,
      entry.moderator.id,
      keyAt,
    )
    const erased = await sweepCopyrightEvidenceRetention({
      now: new Date(Date.now() + 400 * DAY_MS),
      noticeIds: [entry.noticeId],
    })
    expect(erased).toEqual({ erased: 1, ineligible: 0, failed: [] })
    await using query = await beginTransaction()
    expect(await expectOwnedPageDeletion(query, 'copyright_rationales_erased', id, keyAt)).toEqual({
      deleted: 1,
      hasMore: false,
    })
  })
})
