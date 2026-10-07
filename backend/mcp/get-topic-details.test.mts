import { beforeAll, describe, expect, it } from 'vitest'
import getTopicDetailsTool from './get-topic-details.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopic, updateTopicMarkdown } from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'

describe('get_topic_details tool — real DB', () => {
  let user: PrivateUser
  const suffix = crypto.randomUUID().slice(0, 8)

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns topic details for a plain topic', async () => {
    const topicId = await insertTestTopic({
      name: `Details Tool Topic ${suffix}`,
      slug: `details-tool-topic-${suffix}`,
      createdById: user.id,
    })

    const execute = getTopicDetailsTool.function(user)
    const result = await execute({ topic_id: topicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.id).toBe(topicId)
    expect(result.name).toBe(`Details Tool Topic ${suffix}`)
    expect(result.slug).toBe(`details-tool-topic-${suffix}`)
    expect(result.topic_type).toBe('topic')
    expect(result.aliases).toBeInstanceOf(Array)
  })

  it('marks the topic markdown as external content', async () => {
    const topicId = await insertTestTopic({
      name: `Details Tool Markdown ${suffix}`,
      slug: `details-tool-markdown-${suffix}`,
      createdById: user.id,
    })
    await updateTopicMarkdown(topicId, `Member notes ${suffix}`)

    const result = await getTopicDetailsTool.function(user)({ topic_id: topicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.markdown).toMatch(
      new RegExp(
        `^<external-content source="user_content" contentType="topic">\\n.*Member notes ${suffix}`,
      ),
    )
    expect(result.markdown).toContain('</external-content>')
  })

  it('returns card type topic', async () => {
    const cardTopicId = await insertTestTopic({
      name: `Details Tool Card ${suffix}`,
      slug: `details-tool-card-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })

    const execute = getTopicDetailsTool.function(user)
    const result = await execute({ topic_id: cardTopicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.topic_type).toBe('card')
    // annual_fee is null since no card attributes were set
    expect(result).toHaveProperty('annual_fee')
    expect(result).toHaveProperty('bank_name')
    expect(result).toHaveProperty('brand_name')
  })

  it('returns success: false for unknown topic', async () => {
    const execute = getTopicDetailsTool.function(user)
    const result = await execute({ topic_id: crypto.randomUUID() })

    expect(result.success).toBe(false)
  })
})
