import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getTestPostgresBackendProcessId,
  insertTestRssFeedDirect,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { lockPostPublicationRssFeedScopes } from '@services/post-publication'
import {
  lockHostnameOwnership,
  lockTopicHostnameMutations,
} from '@services/urls-hostnames/ownership-lock'
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
      const publicationPid = await getTestPostgresBackendProcessId(publication)
      await using owner = await beginTransaction()
      await lockTopicHostnameMutations(owner, [topic.id])
      if (kind.startsWith('additional'))
        await addAdditionalHostname(topic.id, child, admin.id, { query: owner })
      else
        await writeEntityRelations(landing, admin, [{ subject: topic, object: { id: url.id } }], {
          query: owner,
          skipBlockedHostnameGuard: true,
        })
      const ownerPid = await getTestPostgresBackendProcessId(owner)
      await using hider = await beginTransaction()
      const hiderPid = await getTestPostgresBackendProcessId(hider)
      const hiding = disableAndHideSource(feed.id, { query: hider }).then(
        () => null,
        (err: unknown) => err,
      )
      try {
        await waitForTestPostgresLockWaiter(ownerPid, 'lockTopicHostnameMutations')
      } finally {
        await owner.commit()
      }
      await using probe = await beginTransaction()
      let probing: Promise<unknown> | undefined
      let hidingResult: unknown
      let probeResult: unknown
      try {
        await waitForTestPostgresLockWaiter(publicationPid, 'lockPostPublicationRssFeedScopes')
        probing = lockHostnameOwnership(probe, [
          kind.endsWith('ancestor') ? parentId : url.hostname.id,
        ]).then(
          () => null,
          (err: unknown) => err,
        )
        await waitForTestPostgresLockWaiter(hiderPid, 'lockHostnameOwnership')
      } finally {
        await publication.commit()
        hidingResult = await hiding
        if (hidingResult === null) await hider.commit()
        else await hider.rollback()
        probeResult = await probing
      }
      expect(hidingResult).toBeNull()
      expect(probeResult).toBeNull()
      await probe.commit()
      expect(await getTopicByAny(topic.id)).toBeNull()
      expect(await queryRssFeedBaseState(feed.id)).toMatchObject({ is_enabled: false })
    },
  )
})
