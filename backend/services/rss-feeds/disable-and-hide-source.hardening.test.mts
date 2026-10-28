import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { runTestRssFeedHideLockRace } from '@voucha/test-helpers/rss-feed-hide-lock-race'
import { lockPostPublicationRssFeedScopes } from '@services/post-publication'
import { lockTopicHostnameMutations } from '@services/urls-hostnames/ownership-lock'
import { upsertUrlHostnames } from '../urls-hostnames/upsert.mts'
import { addUrl } from '../urls/upsert.mts'
import { addAdditionalHostname } from '../topics/additional-hostnames.mts'
import { getTopicByAny } from '../topics/get.mts'
import { getEntityRelationMetadataOrThrow } from '../entity-relations/metadata.mts'
import { writeEntityRelations } from '../entity-relations/write-relations.mts'
import { queryRssFeedBaseState } from '@voucha/test-helpers/data-stores/psql/views/view-rss-feed-current-states'
import { disableAndHideSource } from './disable-and-hide-source.mts'

const landing = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

describe('source hide releases all hostname ownership', () => {
  it.each(['additional', 'landing', 'additional-ancestor', 'landing-ancestor'] as const)(
    'locks freshly discovered %s ownership before publication',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic({ user: admin, topic_type: 'rss_feed' })
      const feed = await insertTestRssFeedDirect({ topicId: topic.id })
      const parent = `hide-scope-${crypto.randomUUID()}.test`
      const parentId = (await upsertUrlHostnames(admin.id, [parent])).get(parent)!
      const child = `blog.${parent}`
      const url = (await addUrl(admin.id, `https://${child}/`))!
      await using publication = await beginTransaction()
      await lockPostPublicationRssFeedScopes(publication, [feed.id])
      await using owner = await beginTransaction()
      await lockTopicHostnameMutations(owner, [topic.id])
      if (kind.startsWith('additional'))
        await addAdditionalHostname(topic.id, child, admin.id, { query: owner })
      else
        await writeEntityRelations(landing, admin, [{ subject: topic, object: { id: url.id } }], {
          query: owner,
          skipBlockedHostnameGuard: true,
        })
      await runTestRssFeedHideLockRace({
        owner,
        publication,
        topicId: topic.id,
        feedId: feed.id,
        hostnameId: kind.endsWith('ancestor') ? parentId : url.hostname.id,
        hide: query => disableAndHideSource(feed.id, { query }),
      })
      expect(await getTopicByAny(topic.id)).toBeNull()
      expect(await queryRssFeedBaseState(feed.id)).toMatchObject({ is_enabled: false })
    },
  )
})
