import { describe, expect, it, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'
import { createAgentResponse, countRunningAgentResponsesByUserId } from './create.mts'
import { getAgentResponseById } from './get.mts'
import { cancelAgentResponse, updateAgentResponseCompleted } from './update.mts'

describe('create', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('createAgentResponse', () => {
    it('creates an agent response with required fields', async () => {
      const result = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'What is the capital of France?' },
      })

      expect(result.id).toBeDefined()
      expect(result.created_by_id).toBe(user.id)
      expect(result.agent).toBe('research')
      expect(result.input).toEqual({ task: 'What is the capital of France?' })
      expect(result.output).toBeNull()
      expect(result.completed_at).toBeNull()
      expect(result.failed_at).toBeNull()
      expect(result.deleted_at).toBeNull()
      expect(result.created_at).toBeDefined()
    })

    it('stores optional context in input', async () => {
      const result = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Summarize recent AI news', context: 'Focus on safety research' },
      })

      expect(result.input).toEqual({
        task: 'Summarize recent AI news',
        context: 'Focus on safety research',
      })
    })

    it('stores optional model_name and model_provider', async () => {
      const result = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Test task' },
        modelName: 'gpt-5.4-nano',
        modelProvider: 'openai',
      })

      expect(result.model_name).toBe('gpt-5.4-nano')
      expect(result.model_provider).toBe('openai')
    })

    it('is retrievable by id after creation using the primary DB when requested', async () => {
      const result = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Retrieval test' },
      })

      const fetched = await getAgentResponseById(result.id, { readOnly: false })
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(result.id)
    })
  })

  describe('countRunningAgentResponsesByUserId', () => {
    it('returns 0 when user has no running responses', async () => {
      const freshUser = await createTestUser()
      const count = await countRunningAgentResponsesByUserId(freshUser.id)
      expect(count).toBe(0)
    })

    it('counts only non-terminal responses', async () => {
      const freshUser = await createTestUser()

      // Create a running response
      const running = await createAgentResponse({
        createdById: freshUser.id,
        agent: 'research',
        input: { task: 'Running task' },
      })

      // Create a completed response
      const toComplete = await createAgentResponse({
        createdById: freshUser.id,
        agent: 'research',
        input: { task: 'Completed task' },
      })
      await updateAgentResponseCompleted(toComplete.id, { content: 'Done' }, 'no_tool_calls')

      // Create a cancelled response
      const toCancel = await createAgentResponse({
        createdById: freshUser.id,
        agent: 'research',
        input: { task: 'Cancelled task' },
      })
      await cancelAgentResponse(toCancel.id)

      const count = await countRunningAgentResponsesByUserId(freshUser.id)
      expect(count).toBe(1)
      expect(running.id).toBeDefined()
    })
  })
})
