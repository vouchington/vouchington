import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createAgentResponse } from '@services/agent-responses/create'
import {
  updateAgentResponseCompleted,
  updateAgentResponseFailed,
  updateAgentResponseStarted,
} from '@services/agent-responses/update'
import { publishAgentResponseEvent } from '@data-stores/valkey-pubsub'

describe('DELETE /api/v1/agent-responses/:id', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
  })

  it('returns 401 without auth', async () => {
    const req = createRequest()
    await req.delete('/api/v1/agent-responses/00000000-0000-7000-8000-000000000002').expect(401)
  })

  it('returns 404 for nonexistent agent response', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req.delete('/api/v1/agent-responses/00000000-0000-7000-8000-000000000002').expect(404)
  })

  it('returns 403 when another user tries to delete the response', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Delete forbidden test' },
    })

    const req = createRequest()
    await req.authenticateAs(otherUser)
    await req.delete(`/api/v1/agent-responses/${agentResponse.id}`).expect(403)
  })

  it('returns 204 and cancels response for the owner', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Cancel me' },
    })

    const req = createRequest()
    await req.authenticateAs(user)
    await req.delete(`/api/v1/agent-responses/${agentResponse.id}`).expect(204)
  })

  it('cancels response with a job_id without error', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Cancel with job id' },
    })
    await updateAgentResponseStarted(agentResponse.id, 'fake-job-id-123')

    const req = createRequest()
    await req.authenticateAs(user)
    await req.delete(`/api/v1/agent-responses/${agentResponse.id}`).expect(204)
  })
})

describe('GET /api/v1/agent-responses/:id/stream', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
  })

  it('returns 401 without auth', async () => {
    const req = createRequest()
    await req.get('/api/v1/agent-responses/00000000-0000-7000-8000-000000000003/stream').expect(401)
  })

  it('returns 404 for nonexistent agent response', async () => {
    const req = createRequest()
    await req.authenticateAs(user)
    await req.get('/api/v1/agent-responses/00000000-0000-7000-8000-000000000003/stream').expect(404)
  })

  it('returns 403 when another user tries to stream the response', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Stream forbidden test' },
    })

    const req = createRequest()
    await req.authenticateAs(otherUser)
    const response = await req.get(`/api/v1/agent-responses/${agentResponse.id}/stream`).expect(403)

    expect(response.headers['content-type']).not.toContain('text/event-stream')
  })

  it('returns SSE stream with done event for a completed response', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Completed reattach test' },
    })
    await updateAgentResponseCompleted(
      agentResponse.id,
      { content: 'Result text' },
      'no_tool_calls',
    )

    const req = createRequest()
    await req.authenticateAs(user)
    const response = await req.get(`/api/v1/agent-responses/${agentResponse.id}/stream`).expect(200)

    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.text).toContain('event: metadata')
    expect(response.text).toContain('event: done')
    expect(response.text).toContain('Result text')
  })

  it('returns SSE stream with error event for a failed response', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Failed reattach test' },
    })
    await updateAgentResponseFailed(agentResponse.id, { message: 'Something went wrong' }, 'error')

    const req = createRequest()
    await req.authenticateAs(user)
    const response = await req.get(`/api/v1/agent-responses/${agentResponse.id}/stream`).expect(200)

    expect(response.text).toContain('event: metadata')
    expect(response.text).toContain('event: error')
    expect(response.text).toContain('Something went wrong')
  })

  it('includes completed_at, failed_at, deleted_at in metadata snapshot', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Snapshot metadata test' },
    })
    await updateAgentResponseCompleted(agentResponse.id, { content: 'done' }, 'no_tool_calls')

    const req = createRequest()
    await req.authenticateAs(user)
    const response = await req.get(`/api/v1/agent-responses/${agentResponse.id}/stream`).expect(200)

    const metadataLine = response.text
      .split('\n')
      .find(line => line.startsWith('data:') && line.includes('completed_at'))
    expect(metadataLine).toBeTruthy()
  })

  it('recovers terminal state after a disconnected pending stream reconnects', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Disconnect reattach test' },
    })
    await updateAgentResponseStarted(agentResponse.id, 'job-disconnect-reattach')

    const req = createRequest()
    await req.authenticateAs(user)
    const chunks: string[] = []
    await new Promise<void>((resolve, reject) => {
      const streamReq = req
        .get(`/api/v1/agent-responses/${agentResponse.id}/stream`)
        .set('Accept', 'text/event-stream')
        .timeout(5000)
        .buffer(false)

      streamReq.on(
        'response',
        (res: {
          on: (event: string, fn: (...args: unknown[]) => void) => void
          destroy: () => void
        }) => {
          res.on('data', (...args: unknown[]) => {
            chunks.push(String(args[0]))
            if (chunks.join('').includes('event: metadata')) {
              res.destroy()
              resolve()
            }
          })
          res.on('error', () => resolve())
        },
      )

      streamReq.on('error', (err: Error) => {
        if (chunks.length > 0) resolve()
        else reject(err)
      })

      streamReq.catch(() => {
        if (chunks.length > 0) resolve()
      })
    })

    expect(chunks.join('')).toContain('event: metadata')
    await new Promise<void>(resolve => setImmediate(resolve))

    await updateAgentResponseCompleted(
      agentResponse.id,
      { content: 'Durable reconnect result' },
      'no_tool_calls',
    )

    const response = await req.get(`/api/v1/agent-responses/${agentResponse.id}/stream`).expect(200)

    expect(response.text).toContain('event: metadata')
    expect(response.text).toContain('event: done')
    expect(response.text).toContain('Durable reconnect result')
  }, 10_000)

  it('streams live events for an in-progress response via Valkey pub/sub', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Live stream test' },
    })
    const req = createRequest()
    await req.authenticateAs(user)

    const chunks: string[] = []
    const streamReady = Promise.withResolvers<void>()
    const complete = Promise.withResolvers<void>()
    let done = false
    let responseStarted = false
    const streamRequest = req
      .get(`/api/v1/agent-responses/${agentResponse.id}/stream`)
      .set('Accept', 'text/event-stream')
      .buffer(false)

    streamRequest.on(
      'response',
      (response: {
        on: (event: string, listener: (...args: unknown[]) => void) => void
        destroy: () => void
      }) => {
        responseStarted = true
        streamReady.resolve()
        response.on('data', (...args: unknown[]) => {
          const chunk = String(args[0])
          chunks.push(chunk)
          if (chunks.join('').includes('event: done')) {
            done = true
            response.destroy()
            complete.resolve()
          }
        })
        response.on('end', () => {
          if (!done) complete.reject(new Error('Agent response stream ended before its done event'))
        })
        response.on('error', () => {
          if (!done)
            complete.reject(new Error('Agent response stream failed before its done event'))
        })
      },
    )
    streamRequest.on('error', error => {
      if (!responseStarted) {
        streamReady.reject(error)
        return
      }
      if (!done) complete.reject(error)
    })
    void streamRequest.expect(200).then(
      () => undefined,
      error => {
        if (!responseStarted) {
          streamReady.reject(error)
          return
        }
        if (!done) complete.reject(error)
      },
    )

    await streamReady.promise
    await publishAgentResponseEvent(agentResponse.id, {
      type: 'done',
      content: 'Live result',
    })
    await complete.promise
    const body = chunks.join('')
    expect(body).toContain('event: metadata')
    expect(body).toContain('event: done')
    expect(body).toContain('Live result')
  }, 10_000)
})
