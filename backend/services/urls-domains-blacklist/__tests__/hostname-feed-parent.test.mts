import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  getTestHostnameRow,
  insertTestDomainBlacklist,
  beginTransaction,
} from '@voucha/test-helpers'
import {
  hideTestHostnameFromReplicaRead,
  liftTestProjectedHostnameBlock,
  lockTestHostnameNowait,
} from '@voucha/test-helpers/entities/hostname-feed-concurrency'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { getHostnamePolicy } from '../domains.mts'

describe('feed-only parent hostname', () => {
  it('locks the hostname before recomputing concurrent source removals', async () => {
    const domain = `feed-two-sources-${randomUUID()}.test`
    const sourceName = (prefix: string) =>
      `${prefix}-${Array.from(randomUUID().replaceAll('-', ''), digit =>
        String.fromCodePoint(97 + Number.parseInt(digit, 16)),
      ).join('')}`
    const firstName = sourceName('feed-first')
    const secondName = sourceName('feed-second')
    const hostnameId = (await upsertUrlHostnames(null, [domain])).get(domain)!
    const firstSourceId = await createTestBlacklistSource({
      type: 'url',
      name: firstName,
      url: 'https://example.com/first.txt',
    })
    const secondSourceId = await createTestBlacklistSource({
      type: 'url',
      name: secondName,
      url: 'https://example.com/second.txt',
    })
    try {
      await insertTestDomainBlacklist(domain, firstName)
      await insertTestDomainBlacklist(domain, secondName)
      await using firstRemoval = await beginTransaction()
      await liftTestProjectedHostnameBlock(firstSourceId, hostnameId, firstRemoval)
      await using observer = await beginTransaction()
      await expect(lockTestHostnameNowait(hostnameId, observer)).rejects.toMatchObject({
        code: '55P03',
      })
      await observer.rollback()
      await firstRemoval.commit()
      expect((await getTestHostnameRow(hostnameId))?.is_blocked).toBe(true)
    } finally {
      await deleteTestBlacklistSource(firstSourceId)
      await deleteTestBlacklistSource(secondSourceId)
    }
    expect((await getTestHostnameRow(hostnameId))?.is_blocked).toBe(false)
  })

  it('does not turn a feed-only hostname into a parent block after a replica miss', async () => {
    const domain = `feed-conflict-${randomUUID()}.test`
    const sourceName = `feed-conflict-${Array.from(randomUUID().replaceAll('-', ''), digit =>
      String.fromCodePoint(97 + Number.parseInt(digit, 16)),
    ).join('')}`
    const hostnameId = (await upsertUrlHostnames(null, [domain])).get(domain)!
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: sourceName,
      url: 'https://example.com/feed-conflict.txt',
    })
    try {
      await insertTestDomainBlacklist(domain, sourceName)
      expect((await getTestHostnameRow(hostnameId))?.is_blocked).toBe(true)
      await withCommittedPostgresTransactionForTest(async query => {
        const laggedRead = hideTestHostnameFromReplicaRead(query, domain)
        expect((await upsertUrlHostnames(null, [domain], { query: laggedRead })).get(domain)).toBe(
          hostnameId,
        )
      })
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
    expect((await getTestHostnameRow(hostnameId))?.is_blocked).toBe(false)
  })

  it('does not retain a parent block inherited only from a URL feed', async () => {
    const parent = `feed-only-parent-${randomUUID()}.test`
    const child = `sub.${parent}`
    const sourceName = `feed-only-parent-${Array.from(randomUUID().replaceAll('-', ''), digit =>
      String.fromCodePoint(97 + Number.parseInt(digit, 16)),
    ).join('')}`
    await upsertUrlHostnames(null, [parent])
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: sourceName,
      url: 'https://example.com/feed-only-parent.txt',
    })
    let childId: string
    try {
      await insertTestDomainBlacklist(parent, sourceName)
      childId = (await upsertUrlHostnames(null, [child])).get(child)!
      expect((await getTestHostnameRow(childId))?.is_blocked).toBe(false)
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
    expect((await getTestHostnameRow(childId!))?.is_blocked).toBe(false)
    expect((await getHostnamePolicy(child)).is_blocked).toBe(false)
  })
})
