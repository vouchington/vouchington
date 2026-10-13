import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestBlacklistSource,
  createTestUser,
  deleteTestBlacklistSource,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestDomainBlacklist,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { getCommunityListItemCounts, searchCommunityListItems } from './get.mts'

describe('community hostname visibility', () => {
  it('excludes a hostname and its count when a URL feed blocks it', async () => {
    const suffix = randomUUID()
    const hostname = `community-block-${suffix}.example.com`
    const sourceName = `community-block-${Array.from(suffix.replaceAll('-', ''), digit =>
      String.fromCodePoint(97 + Number.parseInt(digit, 16)),
    ).join('')}`
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const hostnameId = await insertTestUrlHostname({ hostname })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'url_hostname',
      entityId: hostnameId,
    })
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: sourceName,
      url: 'https://example.com/community-block.txt',
    })
    try {
      expect((await searchCommunityListItems(community.id, 'url_hostname')).results).toHaveLength(1)
      await insertTestDomainBlacklist(hostname, sourceName)
      expect((await searchCommunityListItems(community.id, 'url_hostname')).results).toHaveLength(0)
      expect((await getCommunityListItemCounts(community.id)).url_hostname).toBe(0)
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })
})
