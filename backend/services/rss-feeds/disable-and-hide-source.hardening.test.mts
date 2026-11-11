import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { runTestRssFeedHideLockRace } from '@voucha/test-helpers/rss-feed-hide-lock-race'
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

describe('source hide after a hostname is attached', () => {
  it.each(['additional', 'landing', 'additional-ancestor', 'landing-ancestor'] as const)(
    'hides the source after a freshly discovered %s hostname is attached',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const topic = await createTestTopic({ user: admin, topic_type: 'rss_feed' })
      const feed = await insertTestRssFeedDirect({ topicId: topic.id })
      const parent = `hide-scope-${crypto.randomUUID()}.test`
      await upsertUrlHostnames(admin.id, [parent])
      const child = `blog.${parent}`
      const url = (await addUrl(admin.id, `https://${child}/`))!
      await using owner = await beginTransaction()
      if (kind.startsWith('additional'))
        await addAdditionalHostname(topic.id, child, admin.id, { query: owner })
      else
        await writeEntityRelations(landing, admin, [{ subject: topic, object: { id: url.id } }], {
          skipBlockedHostnameGuard: true,
        })
      await runTestRssFeedHideLockRace({
        owner,
        hide: query => disableAndHideSource(feed.id, { query }),
      })
      expect(await getTopicByAny(topic.id)).toBeNull()
      expect(await queryRssFeedBaseState(feed.id)).toMatchObject({ is_enabled: false })
    },
  )
})
