import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { createTopicRevision } from '@services/topic-revisions'

describe('Topic content update attribution', () => {
  it('returns topic content update attribution from content revisions only', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Content Attribution ${random}`,
      slug: `content-attribution-${random}`,
      createdById: admin.id,
    })

    await createTopicRevision(
      topicId,
      'update',
      { markdown: { before: '', after: 'A new topic summary.' } },
      admin.id,
    )
    await createTopicRevision(
      topicId,
      'update',
      { hero_image_id: { before: null, after: '00000000-0000-7000-8000-000000000001' } },
      admin.id,
    )

    const response = await createRequest().get(`/api/v1/topics/${topicId}`).expect(200)

    expect(response.body.topic_content_update).toMatchObject({
      updated_by: {
        id: admin.id,
      },
    })
    expect(response.body.topic_content_update.updated_by.roles).toEqual([])
    expect(response.body.topic_content_update.updated_at).toEqual(expect.any(String))
  })
})
