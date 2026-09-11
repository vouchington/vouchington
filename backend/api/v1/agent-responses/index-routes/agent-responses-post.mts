import type { Context } from '@jongleberry/api-server'
import { assertNotSuspended } from '@services/users'
import { createAgentResponse } from '@services/agent-responses/create'
import {
  updateAgentResponseFailed,
  updateAgentResponseJobId,
} from '@services/agent-responses/update'
import {
  assertWithinAgentResponseQuota,
  assertWithinConcurrentAgentResponseLimit,
} from '@services/agent-responses/quota'
import {
  type AgentResponseSubscription,
  subscribeAgentResponseEvents,
} from '@data-stores/valkey-pubsub'
import { enqueueAgentResponse } from '@queues/ai-agents/enqueues/agent-response'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'
import { acquireDuringSSECycle, startSSE } from '../../../sse-helpers.mts'
import {
  persistAndReportAgentResponseStartFailure,
  pipeAgentResponseEventsToSSE,
} from './shared.mts'
import { checkApiMessageSafety } from '../../check-api-message-safety.mts'

const MAX_TASK_LENGTH = 8192
const PRE_ENQUEUE_DISCONNECT_ERROR =
  'The response could not start because the connection ended. Please try again.'

app.route('/api/v1/agent-responses').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/agent-responses')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    400,
    'Invalid request body',
  )

  const agent = body.agent
  ctx.assert(agent === 'research', 400, 'agent must be "research"')

  const task = body.task
  ctx.assert(typeof task === 'string', 400, 'task must be a string')
  ctx.assert(task.trim().length > 0, 400, 'task cannot be empty')
  ctx.assert(
    task.length <= MAX_TASK_LENGTH,
    400,
    `task must be at most ${MAX_TASK_LENGTH} characters`,
  )

  const context = body.context
  ctx.assert(
    context === undefined || context === null || typeof context === 'string',
    400,
    'context must be a string if provided',
  )

  await Promise.all([
    checkApiMessageSafety(task),
    assertWithinConcurrentAgentResponseLimit(currentUser),
  ])
  await assertWithinAgentResponseQuota(currentUser)

  const agentResponse = await createAgentResponse({
    createdById: currentUser.id,
    agent: 'research',
    input: {
      task,
      ...(typeof context === 'string' ? { context } : {}),
    },
  })

  const { stream, pipelinePromise, lifecycleSignal } = startSSE(ctx)
  const emitMetadata = (jobId: string | null) => {
    if (lifecycleSignal.aborted) return
    stream.write(
      `event: metadata\ndata: ${JSON.stringify({
        agent_response_id: agentResponse.id,
        job_id: jobId,
        agent: agentResponse.agent,
      })}\n\n`,
    )
  }

  let subscription: AgentResponseSubscription | undefined
  let closeSubscription: (() => Promise<void>) | undefined
  try {
    emitMetadata(null)
    // Subscribe BEFORE enqueueing to avoid missing early events.
    let acquiredSubscription: Awaited<
      ReturnType<typeof acquireDuringSSECycle<AgentResponseSubscription>>
    >
    try {
      acquiredSubscription = await acquireDuringSSECycle(lifecycleSignal, () =>
        subscribeAgentResponseEvents(agentResponse.id),
      )
    } catch (error) {
      /* v8 ignore start -- deterministic failure requires a forbidden internal subscription mock */
      await persistAndReportAgentResponseStartFailure({
        error,
        persistFailure: async message =>
          Boolean(await updateAgentResponseFailed(agentResponse.id, { message }, 'error')),
        write: data => stream.write(data),
        lifecycleSignal,
      })
      return
      /* v8 ignore stop */
    }
    /* v8 ignore next 8 -- the disconnect-during-acquisition race is covered by the SSE acquisition helper */
    if (!acquiredSubscription) {
      await updateAgentResponseFailed(
        agentResponse.id,
        { message: PRE_ENQUEUE_DISCONNECT_ERROR },
        'stalled',
      )
      return
    }
    subscription = acquiredSubscription.resource
    closeSubscription = acquiredSubscription.close

    let job: Awaited<ReturnType<typeof enqueueAgentResponse>>
    try {
      job = await enqueueAgentResponse(agentResponse.id)
    } catch (error) {
      /* v8 ignore start -- deterministic failure requires a forbidden internal queue mock */
      await persistAndReportAgentResponseStartFailure({
        error,
        persistFailure: async message =>
          Boolean(await updateAgentResponseFailed(agentResponse.id, { message }, 'error')),
        write: data => stream.write(data),
        lifecycleSignal,
        subscription,
      })
      return
      /* v8 ignore stop */
    }
    await updateAgentResponseJobId(agentResponse.id, job.id)

    emitMetadata(job.id)

    await pipeAgentResponseEventsToSSE({
      subscription,
      write: data => stream.write(data),
      lifecycleSignal,
    })
  } finally {
    stream.end()
    await closeSubscription?.()
    await pipelinePromise
  }
})
