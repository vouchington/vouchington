import { describe, expect, it } from 'vitest'
import { callOpenAIAutotagger } from '../openai-autotagger.mts'
import { createTestUser, createTestPost } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
  getConversationById,
  getConversationMessagesByConversationId,
  getConversationMessageAgenticRunEventsByRunId,
  getLatestConversationMessageAgenticRunByConversationMessageId,
} from '@services/conversations-messages'

const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)
describe.skipIf(!hasOpenAIKey)('callOpenAIAutotagger', () => {
  it(
    'runs with real OpenAI call and persists conversation run metadata',
    { timeout: 300_000 },
    /* no-mistakes: integration=openai */
    async () => {
      const user = await createTestUser()
      const post = await createTestPost({
        user: user,
        title: 'Machine Learning Basics',
        markdown:
          'Machine learning is a subset of artificial intelligence that enables systems to learn from data.',
      })

      const conversation = await createConversation(user.id, `Autotag test: ${post.id}`)
      const message = await createConversationMessage(conversation.id, user.id, {
        type: 'autotag',
        entity_type: 'post',
        entity_id: post.id,
      })

      const result = await callOpenAIAutotagger(
        user,
        'post',
        post.id,
        `${post.title}\n\n${post.markdown}`,
        {
          max_topics: 1,
          max_iterations: 1,
          conversationId: conversation.id,
          conversationMessageId: message.id,
        },
      )

      expect(result.topics_added.length).toBeLessThanOrEqual(1)

      const retrievedConversation = await getConversationById(conversation.id)
      expect(retrievedConversation).not.toBeNull()
      expect(retrievedConversation!.title).toBe(`Autotag test: ${post.id}`)

      const messages = await getConversationMessagesByConversationId(conversation.id)
      expect(messages.length).toBe(1)
      expect(messages[0].id).toBe(message.id)
      expect(messages[0].content).toEqual({
        type: 'autotag',
        entity_type: 'post',
        entity_id: post.id,
      })

      const agenticRun = await getLatestConversationMessageAgenticRunByConversationMessageId(
        message.id,
      )
      expect(agenticRun).not.toBeNull()
      expect(agenticRun!.model_name).toBe('gpt-5.4-nano')
      expect(agenticRun!.model_provider).toBe('openai')
      expect(agenticRun!.input).toEqual({ content: `${post.title}\n\n${post.markdown}` })
      expect(agenticRun!.status).toBe('completed')
      expect(agenticRun!.termination_reason).not.toBeNull()
      expect(agenticRun!.started_at).toBeInstanceOf(Date)
      expect(agenticRun!.completed_at).toBeInstanceOf(Date)

      const output = agenticRun!.output as { topics_added: unknown[]; iterations: number }
      expect(output).toHaveProperty('topics_added')
      expect(output).toHaveProperty('iterations')
      expect(Array.isArray(output.topics_added)).toBe(true)
      expect(typeof output.iterations).toBe('number')
      expect(output.iterations).toBeGreaterThanOrEqual(1)
      expect(output.topics_added.length).toBe(result.topics_added.length)

      const events = await getConversationMessageAgenticRunEventsByRunId(agenticRun!.id)
      expect(events.length).toBeGreaterThan(0)
      const modelResponseEvents = events.filter(event => event.type === 'model_response')
      expect(modelResponseEvents.length).toBe(output.iterations)
      const functionCallEvents = events.filter(event => event.type === 'function_call')
      expect(
        functionCallEvents.every(
          event => Boolean((event.input as { name?: unknown })?.name) && Boolean(event.output),
        ),
      ).toBe(true)
    },
  )
})
