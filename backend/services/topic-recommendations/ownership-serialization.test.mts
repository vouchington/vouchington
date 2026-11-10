import { createTestTopicRecommendation } from '@voucha/test-helpers/topic-recommendation-fixtures'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getUrlHostnameTopicId,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { lockTopicRssFeedAttachmentLifecycle } from '@services/post-publication/lock'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { TopicRecommendationPost } from './types.mts'
import { prepareTopicRecommendation } from './create-topic-recommendation.mts'
import { approveTopicRecommendationInTransaction } from './approve-topic-recommendation.mts'
import {
  addAdditionalHostname,
  removeAdditionalHostname,
} from '@services/topics/additional-hostnames'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { addUrl } from '@services/urls/upsert'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { getEntityRelations } from '@services/entity-relations/query'
import { linkHostnameToSourceTopic, setTopicHostnameLink } from '@services/topics/hostname-link'
import { getTopicByAny } from '@services/topics/get'
import '@voucha/test-helpers/entity-url-guard-registrations'

const landing = getEntityRelationMetadataOrThrow({
  subjectType: 'topic',
  objectType: 'url',
  predicate: 'landing_page',
})

describe('hostname ownership serialization against approval', () => {
  let admin: PrivateUser
  let recommendation: TopicRecommendationPost
  let hostname: string
  let hostnameId: string
  let urlId: string
  let otherTopic: Awaited<ReturnType<typeof createTestTopic>>

  beforeEach(async () => {
    admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    hostname = `serialize-${suffix}.example.com`
    recommendation = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      admin,
      WEB_PROVENANCE,
      {
        markdown: 'Hostname serialization',
        topic_title: `Serialize ${suffix}`,
        topic_slug: `serialize-${suffix}`,
        topic_hostnames: [hostname],
      },
    )
    hostnameId = (await getUrlHostnameByAny(hostname))!.id
    urlId = (await addUrl(admin.id, `https://${hostname}/`))!.id
    otherTopic = await createTestTopic({ user: admin })
  })

  it.each(['add', 'remove'] as const)(
    'preserves additional-hostname %s coexistence after approval',
    async operation => {
      if (operation === 'remove') await addAdditionalHostname(otherTopic.id, hostname, admin.id)
      await using holder = await beginTransaction()
      const approved = await approveTopicRecommendationInTransaction(
        admin,
        WEB_PROVENANCE,
        recommendation.id,
        { query: holder },
      )
      await holder.commit()
      if (operation === 'add') await addAdditionalHostname(otherTopic.id, hostname, admin.id)
      else await removeAdditionalHostname(otherTopic.id, hostnameId)
      expect(await getUrlHostnameTopicId(hostnameId)).toBe(
        operation === 'add' ? otherTopic.id : null,
      )
      const relations = await getEntityRelations(
        'topic',
        approved.topic.id,
        'landing_page',
        'url',
        { viewer: { kind: 'anonymous' } },
      )
      expect(relations.map(row => row.object_id)).toContain(urlId)
    },
  )

  it.each(['primary', 'source'] as const)(
    'preserves %s linking coexistence after approval',
    async kind => {
      await using holder = await beginTransaction()
      const approved = await approveTopicRecommendationInTransaction(
        admin,
        WEB_PROVENANCE,
        recommendation.id,
        { query: holder },
      )
      await holder.commit()
      const link = kind === 'primary' ? setTopicHostnameLink : linkHostnameToSourceTopic
      await link(otherTopic.id, hostnameId)
      expect((await getTopicByAny(otherTopic.id))?.hostname_id).toBe(hostnameId)
      expect(await getUrlHostnameTopicId(hostnameId)).toBe(
        kind === 'primary' ? otherTopic.id : null,
      )
      expect(
        (
          await getEntityRelations('topic', approved.topic.id, 'landing_page', 'url', {
            viewer: { kind: 'anonymous' },
          })
        ).map(row => row.object_id),
      ).toContain(urlId)
    },
  )

  it('promotes an existing hostname id without changing the landing-page claim', async () => {
    await using holder = await beginTransaction()
    const approved = await approveTopicRecommendationInTransaction(
      admin,
      WEB_PROVENANCE,
      recommendation.id,
      { query: holder },
    )
    await holder.commit()
    const pending = await upsertUrlHostnames(admin.id, [hostname])
    expect(pending).toEqual(new Map([[hostname, hostnameId]]))
    expect((await getUrlHostnameByAny(hostname))?.publicly_introduced_at).toBeInstanceOf(Date)
    expect(
      (
        await getEntityRelations('topic', approved.topic.id, 'landing_page', 'url', {
          viewer: { kind: 'anonymous' },
        })
      ).map(row => row.object_id),
    ).toContain(urlId)
  })

  it.each(['insert', 'reactivate'] as const)(
    'keeps a landing-page %s after approval',
    async operation => {
      if (operation === 'reactivate') {
        await writeEntityRelations(
          landing,
          admin,
          [{ subject: otherTopic, object: { id: urlId } }],
          { vote: false },
        )
        await softDeleteEntityRelation(admin, landing, otherTopic, [{ id: urlId }])
      }
      await using holder = await beginTransaction()
      await approveTopicRecommendationInTransaction(admin, WEB_PROVENANCE, recommendation.id, {
        query: holder,
      })
      await holder.commit()
      const subject = otherTopic
      const pending = await writeEntityRelations(
        landing,
        admin,
        [{ subject, object: { id: urlId } }],
        { vote: false },
      ).then(
        () => null,
        (err: unknown) => err,
      )
      expect(pending).toBeNull()
      const relations = await getEntityRelations('topic', subject.id, 'landing_page', 'url', {
        viewer: { kind: 'anonymous' },
      })
      expect(relations.some(row => row.object_id === urlId)).toBe(true)
    },
  )

  it('deletes a committed landing page while its topic attachment context is held', async () => {
    await writeEntityRelations(landing, admin, [{ subject: otherTopic, object: { id: urlId } }], {
      vote: false,
    })
    await using holder = await beginTransaction()
    await lockTopicRssFeedAttachmentLifecycle(holder, otherTopic.id)
    await softDeleteEntityRelation(admin, landing, otherTopic, [{ id: urlId }])
    const relations = await getEntityRelations('topic', otherTopic.id, 'landing_page', 'url', {
      viewer: { kind: 'anonymous' },
    })
    expect(relations.some(row => row.object_id === urlId)).toBe(false)
  })
})
