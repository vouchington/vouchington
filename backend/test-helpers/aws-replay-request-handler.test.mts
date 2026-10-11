import { text } from 'node:stream/consumers'
import { describe, expect, it } from 'vitest'
import { createAwsReplayRequestHandler } from './aws-replay-request-handler.mts'
import { createProviderReplay, parseRecordedResponse } from './provider-replay.mts'

const wire = (raw: string) => parseRecordedResponse(Buffer.from(raw, 'utf8'))

describe('AWS replay request handler', () => {
  it('forwards the SDK request to the replay and returns the recorded response in the shape the SDK reads', async () => {
    const replay = createProviderReplay()
    replay.respondWith(wire('HTTP/1.1 200 OK\nx-amzn-requestid: req-1\n\nhello'))

    const { response } = await createAwsReplayRequestHandler(replay).handle({
      method: 'POST',
      protocol: 'https:',
      hostname: 'service.example.com',
      port: 8443,
      path: '/model/a%3A0/invoke',
      query: { list: ['a', 'b'], one: '1', none: null },
      headers: { 'content-type': 'text/plain' },
      body: 'payload',
    })

    expect(replay.requests).toHaveLength(1)
    expect(replay.requests[0]).toMatchObject({
      method: 'POST',
      url: 'https://service.example.com:8443/model/a%3A0/invoke?list=a&list=b&one=1',
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from('payload'),
    })
    expect(response).toMatchObject({
      statusCode: 200,
      reason: 'OK',
      headers: { 'x-amzn-requestid': 'req-1' },
    })
    expect(await text(response.body)).toBe('hello')
    replay.assertDrained()
  })

  it('rejects with the abort reason when the SDK request was already aborted', async () => {
    const replay = createProviderReplay()
    const controller = new AbortController()
    controller.abort(new Error('caller aborted'))

    await expect(
      createAwsReplayRequestHandler(replay).handle(
        {
          method: 'GET',
          protocol: 'https:',
          hostname: 'service.example.com',
          path: '/',
          headers: {},
        },
        { abortSignal: controller.signal },
      ),
    ).rejects.toThrow('caller aborted')
  })

  it('has the lifecycle methods the SDK calls on a handler', () => {
    const handler = createAwsReplayRequestHandler(createProviderReplay())

    expect(() => handler.destroy()).not.toThrow()
    expect(() => handler.updateHttpClientConfig()).not.toThrow()
    expect(handler.httpHandlerConfigs()).toEqual({})
  })

  it('preserves recorded fragments across event boundaries', async () => {
    const replay = createProviderReplay({ chunkBytes: 3 })
    replay.respondWith(
      wire('HTTP/1.1 200 OK\ncontent-type: text/event-stream\n\ndata: 1\n\ndata: 2\n\n'),
    )
    const { response } = await createAwsReplayRequestHandler(replay).handle({
      method: 'GET',
      protocol: 'https:',
      hostname: 'service.example.com',
      path: '/',
      headers: {},
    })
    const chunks: string[] = []
    response.body.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')))

    await expect(text(response.body)).resolves.toBe('data: 1\n\ndata: 2\n\n')
    expect(chunks).toEqual(['dat', 'a: ', '1\n\n', 'dat', 'a: ', '2\n\n'])
    replay.assertDrained()
  })

  it('propagates cancellation while the recorded body is being consumed', async () => {
    const replay = createProviderReplay({ chunkBytes: 3 })
    replay.respondWith(wire('HTTP/1.1 200 OK\n\nfragmented response'))
    const controller = new AbortController()
    const { response } = await createAwsReplayRequestHandler(replay).handle(
      {
        method: 'GET',
        protocol: 'https:',
        hostname: 'service.example.com',
        path: '/',
        headers: {},
      },
      { abortSignal: controller.signal },
    )
    const reason = new Error('caller cancelled the response')
    const reading = text(response.body)
    controller.abort(reason)

    await expect(reading).rejects.toBe(reason)
    replay.assertDrained()
  })
})
