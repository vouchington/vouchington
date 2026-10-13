import { describeCommunityListItemRoutes } from '@voucha/test-helpers/community-list-item-routes'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

describeCommunityListItemRoutes({
  segment: 'domains',
  itemType: 'url_hostname',
  bodyKey: 'url_hostname_id',
  createEntityId: random =>
    insertTestUrlHostname({ hostname: `domain-item-${random}.example.com` }),
})

describe('public community domain response', () => {
  it('omits the internal public-introduction timestamp', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const hostnameId = await insertTestUrlHostname({
      hostname: `community-response-${randomUUID()}.example.com`,
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'url_hostname',
      entityId: hostnameId,
    })

    const response = await createRequest()
      .get(`/api/v1/communities/${community.slug}/list-items/domains`)
      .expect(200)
    expect(response.body.url_hostnames[hostnameId].publicly_introduced_at).toBeUndefined()
    expect(response.body.url_hostnames[hostnameId].id).toBe(hostnameId)
  })
})
