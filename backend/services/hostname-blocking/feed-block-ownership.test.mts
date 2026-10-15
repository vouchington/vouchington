import { randomBytes } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { upsertUrlHostnamesForBlocking } from '@services/urls-hostnames/upsert'
import { lockTestHostnameNowait } from '@voucha/test-helpers/entities/hostname-feed-concurrency'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestBlacklistSource,
  createTestUser,
  deleteTestBlacklistSource,
  getTestHostnameRow,
  insertTestDomainBlacklist,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { describe, expect, it } from 'vitest'
import { blockHostname } from './block-hostname.mts'
import { unblockHostname } from './unblock-hostname.mts'
import { upsertAndBlockHostname } from './upsert-and-block-hostname.mts'

function ownedSourceName() {
  return `feed-${randomBytes(8)
    .toString('hex')
    .replace(/[0-9a-f]/g, digit => String.fromCodePoint(97 + Number.parseInt(digit, 16)))}`
}

describe('feed-owned hostname blocks', () => {
  it('introduces a private root and older child only after staff acquires the ordered block locks', async () => {
    const moderator = (await createTestUser({ administrator: true })) as PrivateUser
    const hostname = `staff-introduce-${randomBytes(6).toString('hex')}.example.com`
    const [childId, rootId] = [uuidv7(), uuidv7()].toSorted()
    await insertTestUrlHostname({ id: childId, hostname: `child.${hostname}` })
    await insertTestUrlHostname({ id: rootId, hostname })

    await using stage = await beginTransaction()
    await upsertUrlHostnamesForBlocking(moderator.id, [hostname], stage)
    await using probe = await beginTransaction()
    await lockTestHostnameNowait(rootId, probe)
    await probe.commit()
    await stage.commit()
    expect((await getTestHostnameRow(rootId))?.publicly_introduced_at).toBeNull()

    const result = await upsertAndBlockHostname(moderator.id, hostname)
    expect(result.id).toBe(rootId)
    for (const id of [childId, rootId]) {
      const row = await getTestHostnameRow(id)
      expect(row?.publicly_introduced_at).toBeInstanceOf(Date)
      expect(row?.is_blocked).toBe(true)
    }
  })

  it.each(['url', 'email'] as const)(
    'manual unblock preserves an active %s feed block until its source is removed',
    async sourceType => {
      const moderator = (await createTestUser({ administrator: true })) as PrivateUser
      const hostname = `feed-unblock-${randomBytes(6).toString('hex')}.example.com`
      const hostnameId = await insertTestUrlHostname({ hostname })
      const sourceName = ownedSourceName()
      const sourceId = await createTestBlacklistSource({
        type: sourceType,
        name: sourceName,
        url: 'https://example.com/owned-feed.txt',
      })
      try {
        await insertTestDomainBlacklist(hostname, sourceName)
        await blockHostname(moderator.id, hostnameId, { penalizeCreators: false })
        expect((await getTestHostnameRow(hostnameId))?.is_blocked).toBe(true)

        await unblockHostname(moderator.id, hostnameId)
        const feedOwned = await getTestHostnameRow(hostnameId)
        expect(feedOwned?.is_blocked).toBe(sourceType === 'url')
        expect(feedOwned?.blocked_at).toBeInstanceOf(Date)
      } finally {
        await deleteTestBlacklistSource(sourceId)
      }
      const afterRemoval = await getTestHostnameRow(hostnameId)
      expect(afterRemoval?.is_blocked).toBe(false)
      expect(afterRemoval?.blocked_at).toBeNull()
    },
  )

  it.each(['url', 'email'] as const)(
    'keeps an explicit admin block after a %s feed is removed',
    async sourceType => {
      const moderator = (await createTestUser({ administrator: true })) as PrivateUser
      const hostname = `feed-admin-${randomBytes(6).toString('hex')}.example.com`
      const hostnameId = await insertTestUrlHostname({ hostname })
      const sourceName = ownedSourceName()
      const sourceId = await createTestBlacklistSource({
        type: sourceType,
        name: sourceName,
        url: 'https://example.com/owned-feed.txt',
      })
      await insertTestDomainBlacklist(hostname, sourceName)
      await blockHostname(moderator.id, hostnameId, { penalizeCreators: false })
      await deleteTestBlacklistSource(sourceId)
      expect((await getTestHostnameRow(hostnameId))?.is_blocked).toBe(true)
      await unblockHostname(moderator.id, hostnameId)
      expect((await getTestHostnameRow(hostnameId))?.is_blocked).toBe(false)
    },
  )
})
