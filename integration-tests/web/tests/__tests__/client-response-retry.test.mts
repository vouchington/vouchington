import http from 'node:http'
import { describe, expect, it } from 'vitest'
import { WebIntegrationClient } from '../../helpers/client.mts'
import { listenOnFetchSafeEphemeralPort } from '../../helpers/ports.mts'

describe('WebIntegrationClient response retry', () => {
  it('retries a missing request-id response and returns the accepted response unchanged', async () => {
    let requestCount = 0
    const server = http.createServer((_request, response) => {
      requestCount++
      if (requestCount === 1) {
        response.end('restart banner')
        return
      }
      response.writeHead(200, { 'x-request-id': 'request-123' })
      response.end('final response')
    })
    const port = await listenOnFetchSafeEphemeralPort(server)
    const origin = `http://127.0.0.1:${port}`

    try {
      const client = new WebIntegrationClient(origin, 'https://trace.example', '')
      const response = await client.request('/retry')

      expect(requestCount).toBe(2)
      expect(response.url).toBe(`${origin}/retry`)
      expect(await response.text()).toBe('final response')
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()))
      })
    }
  })
})
