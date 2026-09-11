import { describe, expect, it, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'
import { createAgentResponse } from './create.mts'
import { getAgentResponseById } from './get.mts'
import {
  updateAgentResponseStarted,
  updateAgentResponseCompleted,
  updateAgentResponseFailed,
  cancelAgentResponse,
} from './update.mts'

describe('update', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('updateAgentResponseStarted', () => {
    it('sets job_id and started_at', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Start test' },
      })

      const jobId = 'test-job-id-12345'
      const updated = await updateAgentResponseStarted(agentResponse.id, jobId)

      expect(updated).toBeDefined()
      if (!updated) throw new Error('Expected the response to be claimed')
      expect(updated.job_id).toBe(jobId)
      expect(updated.started_at).not.toBeNull()
      expect(updated.completed_at).toBeNull()
      expect(updated.failed_at).toBeNull()
    })

    it('does not claim a response that failed before the worker started', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Failed before claim' },
      })
      await updateAgentResponseFailed(agentResponse.id, { message: 'Pre-claim failure' }, 'error')

      await expect(
        updateAgentResponseStarted(agentResponse.id, 'late-job'),
      ).resolves.toBeUndefined()
    })

    it('allows only the first delivery to claim a response', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Duplicate delivery' },
      })

      await expect(updateAgentResponseStarted(agentResponse.id, 'first-job')).resolves.toBeDefined()
      await expect(
        updateAgentResponseStarted(agentResponse.id, 'second-job'),
      ).resolves.toBeUndefined()
    })

    it('does not claim a response that was deleted before the worker started', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Deleted before claim' },
      })
      await cancelAgentResponse(agentResponse.id)

      await expect(
        updateAgentResponseStarted(agentResponse.id, 'late-job'),
      ).resolves.toBeUndefined()
    })
  })

  describe('updateAgentResponseCompleted', () => {
    it('sets output, termination_reason, and completed_at', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Complete test' },
      })

      const updated = await updateAgentResponseCompleted(
        agentResponse.id,
        { content: 'Paris is the capital of France.' },
        'no_tool_calls',
      )
      expect(updated).toBeDefined()
      if (!updated) throw new Error('Expected the completion transition to persist')

      expect(updated.output).toEqual({ content: 'Paris is the capital of France.' })
      expect(updated.termination_reason).toBe('no_tool_calls')
      expect(updated.completed_at).not.toBeNull()
      expect(updated.failed_at).toBeNull()

      const fetched = await getAgentResponseById(agentResponse.id)
      expect(fetched!.completed_at).not.toBeNull()
    })

    it('does not overwrite a failed terminal response', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Remain failed' },
      })
      await updateAgentResponseFailed(agentResponse.id, { message: 'Failed first' }, 'error')

      const result = await updateAgentResponseCompleted(
        agentResponse.id,
        { content: 'Late completion' },
        'no_tool_calls',
      )

      expect(result).toBeUndefined()

      const fetched = await getAgentResponseById(agentResponse.id)
      expect(fetched).toMatchObject({
        completed_at: null,
        error: { message: 'Failed first' },
        termination_reason: 'error',
      })
      expect(fetched!.failed_at).not.toBeNull()
    })
  })

  describe('updateAgentResponseFailed', () => {
    it('sets error, termination_reason, and failed_at', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Fail test' },
      })

      const updated = await updateAgentResponseFailed(
        agentResponse.id,
        { message: 'Connection timed out' },
        'stalled',
      )
      expect(updated).toBeDefined()
      if (!updated) throw new Error('Expected the failure transition to persist')

      expect(updated.error).toEqual({ message: 'Connection timed out' })
      expect(updated.termination_reason).toBe('stalled')
      expect(updated.failed_at).not.toBeNull()
      expect(updated.completed_at).toBeNull()
    })

    it('does not overwrite a completed terminal response', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Remain completed' },
      })
      await updateAgentResponseCompleted(
        agentResponse.id,
        { content: 'Completed first' },
        'no_tool_calls',
      )

      const result = await updateAgentResponseFailed(
        agentResponse.id,
        { message: 'Late failure' },
        'error',
      )

      expect(result).toBeUndefined()

      const fetched = await getAgentResponseById(agentResponse.id)
      expect(fetched).toMatchObject({
        error: null,
        output: { content: 'Completed first' },
        termination_reason: 'no_tool_calls',
      })
      expect(fetched!.completed_at).not.toBeNull()
      expect(fetched!.failed_at).toBeNull()
    })

    it('does not overwrite an existing failure when cleanup is retried', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Retried failure cleanup' },
      })
      await updateAgentResponseFailed(
        agentResponse.id,
        { message: 'Connection ended first' },
        'stalled',
      )

      const result = await updateAgentResponseFailed(
        agentResponse.id,
        { message: 'Later fallback' },
        'error',
      )

      expect(result).toBeUndefined()
      await expect(getAgentResponseById(agentResponse.id)).resolves.toMatchObject({
        error: { message: 'Connection ended first' },
        termination_reason: 'stalled',
      })
    })
  })

  describe('cancelAgentResponse', () => {
    it('returns the claimed job ID from the cancellation transition', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Cancel claimed response' },
      })
      await updateAgentResponseStarted(agentResponse.id, 'claimed-job-id')

      await expect(cancelAgentResponse(agentResponse.id)).resolves.toBe('claimed-job-id')
    })

    it('sets deleted_at so response is no longer visible', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Cancel test' },
      })

      await expect(cancelAgentResponse(agentResponse.id)).resolves.toBeNull()

      const fetched = await getAgentResponseById(agentResponse.id)
      expect(fetched).toBeNull()
    })

    it('is idempotent when called twice', async () => {
      const agentResponse = await createAgentResponse({
        createdById: user.id,
        agent: 'research',
        input: { task: 'Double cancel test' },
      })

      await expect(cancelAgentResponse(agentResponse.id)).resolves.toBeNull()
      await expect(cancelAgentResponse(agentResponse.id)).resolves.toBeNull()
    })
  })
})
