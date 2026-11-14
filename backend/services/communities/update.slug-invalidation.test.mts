import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { getCommunity } from './get.mts'
import { updateCommunity } from './update.mts'

describe('community update with a stale loaded community', () => {
  it('commits the newest slug without requiring the loaded row to be current', async () => {
    const user = await createTestUser({ administrator: true })
    const community = await insertTestCommunity({ createdById: user.id })
    const loaded = await getCommunity(community.id)
    if (!loaded) throw new Error('Missing created community')
    await updateCommunity(user, community.id, { slug: `intermediate-${randomUUID()}` })
    const finalSlug = `final-${randomUUID()}`

    await updateCommunity(user, community.id, { slug: finalSlug }, undefined, {
      community: loaded,
    })

    expect((await getCommunity(community.id))?.slug).toBe(finalSlug)
  })
})
