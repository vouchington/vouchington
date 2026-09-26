import { describe, expect, it, vi } from 'vitest'
import { callOpenAIAutotagger } from '../openai-autotagger.mts'
import { runToolLoop } from '@agents/_shared'
import type { createOpenRouterResponse as CreateOpenRouterResponse } from '@modules/openrouter-utils'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  countPostRelatedTopics,
  getEntityRelation,
} from '@voucha/test-helpers'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation'
import {
  createConversation,
  createConversationMessage,
  getConversationById,
  getConversationMessagesByConversationId,
  getConversationMessageAgenticRunEventsByRunId,
  getLatestConversationMessageAgenticRunByConversationMessageId,
} from '@services/conversations-messages'
import {
  makeSdkResponse,
  makeSdkTextResponse,
} from '../../../test-helpers/modules/openai-utils/responses.mts'

const CATEGORY_TABLE = 'relation__post__category__topic'
const MODEL = 'openai/gpt-5.4-nano'

describe('callOpenAIAutotagger with real tools and persistence', () => {
  it('adds exactly one topic through the real tool loop and persists the run transcript', async () => {
    const owner = await createTestUser()
    const post = await createTestPost({ user: owner })
    const unrelatedPost = await createTestPost({ user: owner })
    const topic = await createTestTopic({ user: owner })
    const content = `Categorize ${post.id}`
    const conversation = await createConversation(owner.id, `Autotag ${post.id}`)
    const message = await createConversationMessage(conversation.id, owner.id, {
      type: 'autotag',
      entity_type: 'post',
      entity_id: post.id,
    })
    const toolCall = {
      type: 'function_call' as const,
      call_id: 'call-autotag-one',
      name: 'add_related_topic',
      arguments: JSON.stringify({ topic_id: topic.id }),
      status: 'completed' as const,
    }
    const response = makeSdkResponse({
      id: 'resp-autotag-one',
      model: MODEL,
      status: 'completed',
      output: [toolCall],
      usage: null,
    })
    const createOpenRouterResponse = vi
      .fn<typeof CreateOpenRouterResponse>()
      .mockResolvedValue(response)

    const result = await callOpenAIAutotagger(
      owner,
      'post',
      post.id,
      content,
      {
        max_topics: 1,
        max_iterations: 1,
        conversationId: conversation.id,
        conversationMessageId: message.id,
      },
      {
        runToolLoop: config =>
          runToolLoop({ ...config, deps: { ...config.deps, createOpenRouterResponse } }),
      },
    )

    expect(createOpenRouterResponse).toHaveBeenCalledOnce()
    expect(createOpenRouterResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODEL,
        input: content,
        safety_identifier: owner.id,
        metadata: { type: 'autotagger', entity_id: post.id, entity_type: 'post' },
      }),
      expect.anything(),
    )
    expect(result.topics_added).toEqual([{ id: topic.id, name: topic.name }])
    const relations = await getEntityRelation(CATEGORY_TABLE, post.id, topic.id)
    expect(relations).toHaveLength(1)
    const [relation] = relations as Array<{
      id: string
      subject_id: string
      object_id: string
      created_by_id: string
      deleted_at: Date | null
    }>
    expect(relation).toMatchObject({
      subject_id: post.id,
      object_id: topic.id,
      created_by_id: owner.id,
      deleted_at: null,
    })
    await expect(getEntityRelationElectionVote(owner.id, relation.id)).resolves.toMatchObject({
      entity_id: relation.id,
      user_id: owner.id,
      choice: 'confirm',
    })
    expect(await countPostRelatedTopics(post.id)).toBe(1)
    expect(await countPostRelatedTopics(unrelatedPost.id)).toBe(0)
    expect(await getEntityRelation(CATEGORY_TABLE, unrelatedPost.id, topic.id)).toEqual([])

    await expect(getConversationById(conversation.id)).resolves.toMatchObject({
      title: `Autotag ${post.id}`,
      created_by_id: owner.id,
    })
    const messages = await getConversationMessagesByConversationId(conversation.id)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ id: message.id, created_by_id: owner.id })
    expect(messages[0].content).toEqual({
      type: 'autotag',
      entity_type: 'post',
      entity_id: post.id,
    })
    const run = await getLatestConversationMessageAgenticRunByConversationMessageId(message.id)
    expect(run).toMatchObject({
      conversation_id: conversation.id,
      conversation_message_id: message.id,
      model_name: MODEL,
      model_provider: 'openrouter',
      input: { content },
      output: { topics_added: [{ id: topic.id, name: topic.name }], iterations: 1 },
      status: 'completed',
      termination_reason: 'max_topics',
      error: null,
    })
    expect(run!.started_at).toBeInstanceOf(Date)
    expect(run!.completed_at).toBeInstanceOf(Date)
    const events = await getConversationMessageAgenticRunEventsByRunId(run!.id)
    expect(events.map(event => event.type)).toEqual(['model_response', 'function_call'])
    expect(events[0].input).toMatchObject({
      response_id: response.id,
      iteration: 1,
      tool_calls_count: 1,
    })
    expect(events[0].output).toEqual([toolCall])
    expect(events[1].input).toEqual(toolCall)
    expect(events[1].output).toEqual({
      success: true,
      topic_id: topic.id,
      topic_name: topic.name,
    })
  })

  it('completes a no-tool response without writing a category relation or vote', async () => {
    const owner = await createTestUser()
    const post = await createTestPost({ user: owner })
    const topic = await createTestTopic({ user: owner })
    const content = `No relevant topics for ${post.id}`
    const conversation = await createConversation(owner.id, `Autotag no-tool ${post.id}`)
    const message = await createConversationMessage(conversation.id, owner.id, {
      type: 'autotag',
      entity_type: 'post',
      entity_id: post.id,
    })
    const response = makeSdkTextResponse('No related topic.', {
      id: 'resp-autotag-no-tool',
      model: MODEL,
      usage: null,
    })
    const createOpenRouterResponse = vi
      .fn<typeof CreateOpenRouterResponse>()
      .mockResolvedValue(response)

    const result = await callOpenAIAutotagger(
      owner,
      'post',
      post.id,
      content,
      {
        max_topics: 1,
        max_iterations: 1,
        conversationId: conversation.id,
        conversationMessageId: message.id,
      },
      {
        runToolLoop: config =>
          runToolLoop({ ...config, deps: { ...config.deps, createOpenRouterResponse } }),
      },
    )

    expect(createOpenRouterResponse).toHaveBeenCalledOnce()
    expect(result.topics_added).toEqual([])
    expect(await countPostRelatedTopics(post.id)).toBe(0)
    expect(await getEntityRelation(CATEGORY_TABLE, post.id, topic.id)).toEqual([])
    const run = await getLatestConversationMessageAgenticRunByConversationMessageId(message.id)
    expect(run).toMatchObject({
      model_name: MODEL,
      model_provider: 'openrouter',
      input: { content },
      output: { topics_added: [], iterations: 1 },
      status: 'completed',
      termination_reason: 'no_tool_calls',
      error: null,
    })
    const events = await getConversationMessageAgenticRunEventsByRunId(run!.id)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('model_response')
    expect(events[0].input).toMatchObject({
      response_id: response.id,
      iteration: 1,
      tool_calls_count: 0,
    })
    expect(events[0].output).toEqual(response.output)
  })
})
