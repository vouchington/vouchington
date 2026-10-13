import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  getTestHostnameRow,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { getHostnamePolicy } from '../domains.mts'

describe('feed-only parent hostname', () => {
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
