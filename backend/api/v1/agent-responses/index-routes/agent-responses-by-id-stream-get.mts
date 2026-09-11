/**
 * GET /api/v1/agent-responses/:id/stream
 *
 * Reattach SSE: subscribe to the Valkey pub/sub channel, emit initial snapshot,
 * then stream events until the agent response reaches a terminal state.
 *
 * Disconnect semantics: SSE disconnect does NOT abort the job.
 * The client paid quota. Reconnect here to reattach. Cancel via DELETE.
 */
import type { Context } from '@jongleberry/api-server'
import { getAgentResponseById } from '@services/agent-responses/get'
import { assertCurrentUserCanViewAgentResponse } from '@services/agent-responses/authorization'
import { subscribeAgentResponseEvents } from '@data-stores/valkey-pubsub'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'
import { startSSE, watchForAbortBeforeSSE } from '../../../sse-helpers.mts'
import { pipeAgentResponseEventsToSSE } from './shared.mts'

app.route('/api/v1/agent-responses/:id/stream').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/agent-responses/:id/stream')

  const id = ctx.params.id!

  // Use primary reads around subscription so a terminal event published between
  // auth and subscribe is still visible in the post-subscribe snapshot.
  const initialAgentResponse = await getAgentResponseById(id, { readOnly: false })
  if (!initialAgentResponse) {
    ctx.throw(404, 'Agent response not found')
  }

  assertCurrentUserCanViewAgentResponse(initialAgentResponse, currentUser)

  // Subscribe BEFORE the snapshot read used for SSE output to avoid missing terminal events
  // published between the DB read and the subscription setup.
  const subscription = await subscribeAgentResponseEvents(id)
  let subscriptionClosed = false
  let closeSubscriptionPromise: Promise<void> | undefined
  const closeSubscription = () => {
    if (subscriptionClosed) return
    subscriptionClosed = true
    closeSubscriptionPromise = Promise.resolve(subscription.close())
  }
  const preSSEAbort = watchForAbortBeforeSSE(ctx.signal, closeSubscription)
  let sse: ReturnType<typeof startSSE> | undefined

  try {
    const agentResponse = await getAgentResponseById(id, { readOnly: false })
    if (!agentResponse) ctx.throw(404, 'Agent response not found')
    if (preSSEAbort.wasAborted()) return

    sse = startSSE(ctx)
    preSSEAbort.stop()
    const { stream } = sse

    // Send snapshot metadata so the client can reconcile state.
    stream.write(
      `event: metadata\ndata: ${JSON.stringify({
        agent_response_id: agentResponse.id,
        job_id: agentResponse.job_id,
        agent: agentResponse.agent,
        completed_at: agentResponse.completed_at ?? null,
        failed_at: agentResponse.failed_at ?? null,
        deleted_at: agentResponse.deleted_at ?? null,
      })}\n\n`,
    )

    // If the response is already terminal, emit the terminal event and close.
    if (agentResponse.completed_at) {
      stream.write(
        `event: done\ndata: ${JSON.stringify({ content: agentResponse.output?.content ?? '' })}\n\n`,
      )
      return
    }
    if (agentResponse.failed_at) {
      stream.write(
        `event: error\ndata: ${JSON.stringify({ error: agentResponse.error?.message ?? 'Failed' })}\n\n`,
      )
      return
    }

    await pipeAgentResponseEventsToSSE({
      subscription,
      write: data => stream.write(data),
      lifecycleSignal: sse.lifecycleSignal,
    })
  } finally {
    preSSEAbort.stop()
    closeSubscription()
    sse?.stream.end()
    await closeSubscriptionPromise
    await sse?.pipelinePromise
  }
})
