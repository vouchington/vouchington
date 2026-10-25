import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getTestPostgresBackendProcessId,
  insertTestRssFeedDirect,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { queryRssFeedBaseState } from '@voucha/test-helpers/data-stores/psql/views/view-rss-feed-current-states'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { getEntityRelations } from '@services/entity-relations/query'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'
import { disableAndHideSource } from '../rss-feeds/disable-and-hide-source.mts'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'
import { getPublisherTypeTopics } from './publisher-type-topics.mts'

async function createRssFeedTopic(admin: Awaited<ReturnType<typeof createTestUser>>) {
  const row = await createTestTopic({ user: admin, topic_type: 'rss_feed' })
  const topic = await getTopicByAny(row.id)
  if (!topic) throw new Error(`Test topic not found: ${row.id}`)
  return topic
}

describe('topic merge ownership and lifecycle ordering', () => {
  it('lets a publisher-type writer finish while the merge waits for attachment publication', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createRssFeedTopic(admin)
    const destination = await createRssFeedTopic(admin)
    const publisherTypeId = (await getPublisherTypeTopics()).find(
      topic => topic.slug === 'blog',
    )?.id
    if (!publisherTypeId) throw new Error('Publisher-type fixture not seeded')
    const publisherType = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'publisher_type',
    })

    await using writer = await beginTransaction()
    await lockTopicRssFeedAttachmentLifecycles(writer, [destination.id])
    const writerPid = await getTestPostgresBackendProcessId(writer)
    const merging = mergeTopicAliases(admin, source, destination).then(
      () => null,
      (err: unknown) => err,
    )
    const waitError = await waitForTestPostgresLockWaiter(
      writerPid,
      'lockTopicRssFeedAttachmentLifecycles',
    ).then(
      () => null,
      (err: unknown) => err,
    )
    const writeError = waitError
      ? null
      : await writeEntityRelations(
          publisherType,
          admin,
          [{ subject: destination, object: { id: publisherTypeId } }],
          { query: writer, vote: false },
        ).then(
          () => null,
          (err: unknown) => err,
        )
    if (waitError || writeError) await writer.rollback()
    else await writer.commit()
    const mergeError = await merging
    if (waitError)
      throw new Error('Merge did not wait on attachment publication', { cause: waitError })
    expect(writeError).toBeNull()
    expect(mergeError).toBeNull()
    const relations = await getEntityRelations('topic', destination.id, 'publisher_type', 'topic', {
      viewer: { kind: 'system' },
    })
    expect(relations.map(relation => relation.object_id)).toContain(publisherTypeId)
  })

  it('serializes a source hide before a merge on the topic ownership key', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createRssFeedTopic(admin)
    const destination = await createRssFeedTopic(admin)
    const feed = await insertTestRssFeedDirect({ topicId: source.id })

    await using hider = await beginTransaction()
    await disableAndHideSource(feed.id, { query: hider })
    const hiderPid = await getTestPostgresBackendProcessId(hider)
    const merging = mergeTopicAliases(admin, source, destination).then(
      () => null,
      (err: unknown) => err,
    )
    const waitError = await waitForTestPostgresLockWaiter(
      hiderPid,
      'lockTopicHostnameMutations',
    ).then(
      () => null,
      (err: unknown) => err,
    )
    await hider.commit()
    const mergeError = await merging
    if (waitError) throw new Error('Merge did not wait on source ownership', { cause: waitError })
    expect(mergeError).toMatchObject({ status: 404 })
    expect(await getTopicByAny(source.id)).toBeNull()
    expect(await queryRssFeedBaseState(feed.id)).toMatchObject({ is_enabled: false })
  })
})
