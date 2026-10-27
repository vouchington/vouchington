import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getUrlHostnameTopicId,
  insertTestRssFeedDirect,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-waiter'
import {
  getActiveLandingPageHostnameClaims,
  getFirstTestHostnameOwnershipLockKey,
} from '@voucha/test-helpers/hostname-ownership'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { blockHostnameInTransaction } from '../hostname-blocking/block-hostname.mts'
import { createTopicRecommendation } from '../topic-recommendations/create-topic-recommendation.mts'
import { approveTopicRecommendationInTransaction } from '../topic-recommendations/approve-topic-recommendation.mts'
import { disableAndHideSource } from '../rss-feeds/disable-and-hide-source.mts'
import { setTopicHostnameLink, linkHostnameToSourceTopic } from './hostname-link.mts'
import { getTopicByAny } from './get.mts'
import { addUrl } from '@services/urls/upsert'
import { lockTopicHostnameMutations } from '@services/urls-hostnames/ownership-lock'
import { updateRssFeedById } from '../rss-feeds/update.mts'
import { getRssFeedById } from '../rss-feeds/get.mts'

describe('hostname ownership lifecycle and ancestor serialization', () => {
  it('hides only the locked topic when a feed is concurrently reassigned', async () => {
    const admin = await createTestUser({ administrator: true })
    const first = await createTestTopic({ user: admin, topic_type: 'rss_feed' })
    const second = await createTestTopic({
      user: admin,
      topic_type: 'rss_feed',
      hostname: `reassigned-${crypto.randomUUID()}.example.com`,
    })
    const feed = await insertTestRssFeedDirect({ topicId: first.id })
    await using holder = await beginTransaction()
    await lockTopicHostnameMutations(holder, [first.id])
    await using waiter = await createTestPostgresLockWaiter({
      holder,
      lock: { kind: 'advisory64', key: `topic-hostname:${first.id.toLowerCase()}` },
      selected: {
        marker: '/* lockTopicHostnameMutations */',
        binding: { index: 1, value: [first.id.toLowerCase()] },
      },
    })
    const hiding = disableAndHideSource(feed.id, { query: waiter.query })
    try {
      await waiter.waitForLock(hiding)
      await updateRssFeedById(feed.id, { topic_id: second.id })
    } finally {
      await holder.commit()
    }
    await expect(hiding).resolves.toBeUndefined()
    await waiter.query.commit()
    expect(await getTopicByAny(first.id)).toBeNull()
    expect(await getTopicByAny(second.id)).not.toBeNull()
    expect(await getRssFeedById(feed.id)).toMatchObject({
      topic: { id: second.id },
      is_enabled: false,
    })
  })
  it.each(['primary', 'source'] as const)(
    'stabilizes the old hostname across two %s moves',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic({ user: admin })
      const suffix = crypto.randomUUID()
      const names = ['old', 'first', 'second'].map(name => `${name}-${suffix}.example.com`)
      const ids = await upsertUrlHostnames(admin.id, names)
      const [oldId, firstId, secondId] = names.map(name => ids.get(name)!)
      await setTopicHostnameLink(topic.id, oldId!)
      const move = kind === 'primary' ? setTopicHostnameLink : linkHostnameToSourceTopic
      await using holder = await beginTransaction()
      await move(topic.id, firstId!, { query: holder })
      await using waiter = await createTestPostgresLockWaiter({
        holder,
        lock: { kind: 'advisory64', key: `topic-hostname:${topic.id.toLowerCase()}` },
        selected: {
          marker: '/* lockTopicHostnameMutations */',
          binding: { index: 1, value: [topic.id.toLowerCase()] },
        },
      })
      const pending = move(topic.id, secondId!, { query: waiter.query })
      try {
        await waiter.waitForLock(pending)
      } finally {
        await holder.commit()
      }
      await expect(pending).resolves.toBeUndefined()
      await waiter.query.commit()
      expect((await getTopicByAny(topic.id))?.hostname_id).toBe(secondId)
      expect(await getUrlHostnameTopicId(oldId!)).toBeNull()
      expect(await getUrlHostnameTopicId(firstId!)).toBeNull()
      expect(await getUrlHostnameTopicId(secondId!)).toBe(kind === 'primary' ? topic.id : null)
    },
  )

  it('waits for a parent block, then rejects the subdomain claim using fresh policy', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const parent = `blocked-parent-${suffix}.example.com`
    const child = `blog.${parent}`
    const hostnames = await upsertUrlHostnames(admin.id, [parent, child])
    const recommendation = await createTopicRecommendation(admin, WEB_PROVENANCE, {
      markdown: 'Parent block race',
      topic_title: `Parent ${suffix}`,
      topic_slug: `parent-${suffix}`,
      topic_hostnames: [child],
    })
    await using holder = await beginTransaction()
    await blockHostnameInTransaction(admin.id, hostnames.get(parent)!, holder, {
      penalizeCreators: false,
    })
    await using waiter = await createTestPostgresLockWaiter({
      holder,
      lock: { kind: 'advisory64', key: hostnames.get(parent)!.toLowerCase() },
      selected: {
        marker: '/* lockHostnameOwnership */',
        binding: { index: 0, value: [hostnames.get(child)!.toLowerCase()] },
      },
    })
    const pending = approveTopicRecommendationInTransaction(
      admin,
      WEB_PROVENANCE,
      recommendation.id,
      { query: waiter.query },
    )
    const rejection = pending.then(
      () => null,
      (err: unknown) => err,
    )
    try {
      await waiter.waitForLock(pending)
    } finally {
      await holder.commit()
    }
    expect(await rejection).toMatchObject({ status: 422 })
    await waiter.query.rollback()
    expect(await getActiveLandingPageHostnameClaims([hostnames.get(child)!])).toEqual([])
    const newChild = `new.${parent}`
    await upsertUrlHostnames(admin.id, [newChild])
    expect((await getUrlHostnameByAny(newChild))?.is_blocked).toBe(true)
    await expect(addUrl(admin.id, `https://${newChild}/`)).rejects.toMatchObject({ status: 400 })
  })

  it('serializes source hiding after approval without removing its coexisting landing-page claim', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const parent = `hide-${suffix}.example.com`
    const hostname = `feed.${parent}`
    await upsertUrlHostnames(admin.id, [parent])
    const source = await createTestTopic({ user: admin, topic_type: 'rss_feed' })
    const feed = await insertTestRssFeedDirect({
      topicId: source.id,
      homePageUrl: `https://${hostname}/`,
      rssFeedUrl: `https://${hostname}/feed.xml`,
    })
    const hostnameId = (await getUrlHostnameByAny(hostname))!.id
    const recommendation = await createTopicRecommendation(admin, WEB_PROVENANCE, {
      markdown: 'Source hide race',
      topic_title: `Hide ${suffix}`,
      topic_slug: `hide-${suffix}`,
      topic_hostnames: [hostname],
    })
    await using holder = await beginTransaction()
    const approved = await approveTopicRecommendationInTransaction(
      admin,
      WEB_PROVENANCE,
      recommendation.id,
      { query: holder },
    )
    const heldHostnameKey = await getFirstTestHostnameOwnershipLockKey(holder, hostnameId)
    await using waiter = await createTestPostgresLockWaiter({
      holder,
      lock: { kind: 'advisory64', key: heldHostnameKey },
      selected: {
        marker: '/* lockHostnameOwnership */',
        binding: { index: 0, value: [hostnameId.toLowerCase()] },
      },
    })
    const pending = disableAndHideSource(feed.id, { query: waiter.query })
    try {
      await waiter.waitForLock(pending)
    } finally {
      await holder.commit()
    }
    await expect(pending).resolves.toBeUndefined()
    await waiter.query.commit()
    expect(await getTopicByAny(source.id)).toBeNull()
    expect(await getActiveLandingPageHostnameClaims([hostnameId])).toContain(approved.topic.id)
  })
})
