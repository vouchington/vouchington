import { it, expect, describe, beforeAll } from 'vitest'
import { getPostFeedIds } from '../get-ids.mts'
import {
  followUser,
  blockUrlHostname,
  muteUrlHostname,
  createTestUser,
  createTestPost,
  insertTestUrlHostname,
  insertTestUrl,
  createEntityRelationWithElection,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('getPostFeedIds hostname filtering', () => {
  let viewer: PrivateUser
  let creator: PrivateUser

  beforeAll(async () => {
    viewer = await createTestUser()
    creator = await createTestUser()
    await followUser(viewer, creator)
  }, 60_000)

  it('excludes posts from blocked hostname', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `blocked-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://blocked-${random}.example.com/article`,
      hostnameId,
    })
    const post = await createTestPost({ user: creator })
    await createEntityRelationWithElection(post.id, urlId, creator.id, 1)

    await blockUrlHostname(viewer, hostnameId)

    const result = await getPostFeedIds(viewer, { feed_type: 'follow_users', limit: 100 })
    const found = result.results.find(r => r.entity_id === post.id)
    expect(found).toBeUndefined()
  }, 60_000)

  it('excludes posts from muted hostname', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `muted-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://muted-${random}.example.com/article`,
      hostnameId,
    })
    const post = await createTestPost({ user: creator })
    await createEntityRelationWithElection(post.id, urlId, creator.id, 1)

    await muteUrlHostname(viewer, hostnameId)

    const result = await getPostFeedIds(viewer, { feed_type: 'follow_users', limit: 100 })
    const found = result.results.find(r => r.entity_id === post.id)
    expect(found).toBeUndefined()
  }, 60_000)

  it('excludes posts from site-wide blocked hostname', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `siteblocked-${random}.example.com`,
      blocked: true,
    })
    const urlId = await insertTestUrl({
      url: `https://siteblocked-${random}.example.com/article`,
      hostnameId,
    })
    const post = await createTestPost({ user: creator })
    await createEntityRelationWithElection(post.id, urlId, creator.id, 1)

    const result = await getPostFeedIds(viewer, { feed_type: 'follow_users', limit: 100 })
    const found = result.results.find(r => r.entity_id === post.id)
    expect(found).toBeUndefined()
  }, 60_000)

  it('subdomain matching: blocking parent domain also blocks subdomain posts', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    // Create parent hostname
    const parentHostnameId = await insertTestUrlHostname({
      hostname: `parent-${random}.com`,
    })
    // Create subdomain hostname
    const subHostnameId = await insertTestUrlHostname({
      hostname: `api.parent-${random}.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://api.parent-${random}.com/resource`,
      hostnameId: subHostnameId,
    })
    const post = await createTestPost({ user: creator })
    await createEntityRelationWithElection(post.id, urlId, creator.id, 1)

    // Block only the parent hostname
    await blockUrlHostname(viewer, parentHostnameId)

    const result = await getPostFeedIds(viewer, { feed_type: 'follow_users', limit: 100 })
    const found = result.results.find(r => r.entity_id === post.id)
    expect(found).toBeUndefined()
  }, 60_000)

  it('does NOT exclude posts when hostname has 0-vote URL relation', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `zerovote-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://zerovote-${random}.example.com/article`,
      hostnameId,
    })
    const post = await createTestPost({ user: creator })
    // votes_score_net = 0 → filter should NOT apply
    await createEntityRelationWithElection(post.id, urlId, creator.id, 0)

    await blockUrlHostname(viewer, hostnameId)

    const result = await getPostFeedIds(viewer, { feed_type: 'follow_users', limit: 100 })
    const found = result.results.find(r => r.entity_id === post.id)
    expect(found).toBeDefined()
  }, 60_000)
})
