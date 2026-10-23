import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getTestPostgresBackendProcessId,
  getUrlHostnameTopicId,
  insertTestRssFeedDirect,
  waitForTestPostgresLockWaiter,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { getActiveLandingPageHostnameClaims } from '@voucha/test-helpers/hostname-ownership'
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
    const pid = await getTestPostgresBackendProcessId(holder)
    const hiding = disableAndHideSource(feed.id).then(
      () => null,
      (err: unknown) => err,
    )
    try {
      await waitForTestPostgresLockWaiter(pid, 'lockTopicHostnameMutations')
      await updateRssFeedById(feed.id, { topic_id: second.id })
    } finally {
      await holder.commit()
    }
    expect(await hiding).toBeNull()
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
      const pid = await getTestPostgresBackendProcessId(holder)
      const pending = move(topic.id, secondId!).then(
        () => null,
        (err: unknown) => err,
      )
      try {
        await waitForTestPostgresLockWaiter(pid, 'lockTopicHostnameMutations')
      } finally {
        await holder.commit()
      }
      expect(await pending).toBeNull()
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
    const pid = await getTestPostgresBackendProcessId(holder)
    await using waiter = await beginTransaction()
    const pending = approveTopicRecommendationInTransaction(
      admin,
      WEB_PROVENANCE,
      recommendation.id,
      { query: waiter },
    ).then(
      () => null,
      (err: unknown) => err,
    )
    try {
      await waitForTestPostgresLockWaiter(pid, 'lockHostnameOwnership')
    } finally {
      await holder.commit()
    }
    expect(await pending).toMatchObject({ status: 422 })
    await waiter.rollback()
    expect(await getActiveLandingPageHostnameClaims([hostnames.get(child)!])).toEqual([])
    const newChild = `new.${parent}`
    await upsertUrlHostnames(admin.id, [newChild])
    expect((await getUrlHostnameByAny(newChild))?.is_blocked).toBe(true)
    await expect(addUrl(admin.id, `https://${newChild}/`)).rejects.toMatchObject({ status: 400 })
  })

  it('serializes source hiding after approval without removing its coexisting landing-page claim', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const hostname = `hide-${suffix}.example.com`
    const source = await createTestTopic({ user: admin, topic_type: 'rss_feed' })
    const feed = await insertTestRssFeedDirect({
      topicId: source.id,
      homePageUrl: `https://${hostname}/`,
      rssFeedUrl: `https://${hostname}/feed.xml`,
    })
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
    const pid = await getTestPostgresBackendProcessId(holder)
    const pending = disableAndHideSource(feed.id).then(
      () => null,
      (err: unknown) => err,
    )
    try {
      await waitForTestPostgresLockWaiter(pid, 'lockHostnameOwnership')
    } finally {
      await holder.commit()
    }
    expect(await pending).toBeNull()
    expect(await getTopicByAny(source.id)).toBeNull()
    const hostnameId = (await getUrlHostnameByAny(hostname))!.id
    expect(await getActiveLandingPageHostnameClaims([hostnameId])).toContain(approved.topic.id)
  })
})
