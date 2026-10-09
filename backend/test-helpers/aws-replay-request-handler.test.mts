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
})
