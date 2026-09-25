import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  formatRecordedServerErrorResponses,
  MAX_RECORDED_SERVER_ERROR_RESPONSES,
  recordServerErrorResponse,
  takeRecordedServerErrorResponses,
} from '@voucha/test-helpers/api/server-error-responses'
import app from '@voucha/api/app'

const failingPath = '/api/v1/__tests__/server-error-responses-boom'
const missingPath = '/api/v1/__tests__/server-error-responses-missing'

app.route(failingPath).get(() => {
  throw new Error('staff queue case could not be read')
})

app.route(missingPath).get(ctx => {
  ctx.throw(404, 'not here')
})

describe('API test server 5xx capture', () => {
  it('records the server message and stack of a 5xx for the failing test to print', async () => {
    await createRequest().get(failingPath).expect(500)

    const recorded = takeRecordedServerErrorResponses()
    expect(recorded).toEqual([
      {
        method: 'GET',
        url: expect.stringContaining(failingPath),
        status: 500,
        body: expect.objectContaining({
          message: 'staff queue case could not be read',
          stack: expect.stringContaining('staff queue case could not be read'),
        }),
      },
    ])
    const printed = formatRecordedServerErrorResponses(recorded)
    expect(printed).toContain(`GET ${recorded[0]!.url} -> 500`)
    expect(printed).toContain('"message": "staff queue case could not be read"')
    expect(printed).toContain('at ')
  })

  it('does not record responses below 500', async () => {
    await createRequest().get(missingPath).expect(404)

    expect(takeRecordedServerErrorResponses()).toEqual([])
  })

  it('falls back to the response text when a 5xx has no JSON body', () => {
    recordServerErrorResponse(
      { method: 'POST', url: 'http://[::1]/upstream' },
      { status: 502, body: {}, text: 'Bad Gateway' },
    )

    const recorded = takeRecordedServerErrorResponses()
    expect(recorded).toEqual([
      { method: 'POST', url: 'http://[::1]/upstream', status: 502, body: 'Bad Gateway' },
    ])
    expect(formatRecordedServerErrorResponses(recorded)).toContain('-> 502\nBad Gateway')
  })

  it('keeps only the most recent responses when nothing drains the buffer', () => {
    for (let index = 0; index <= MAX_RECORDED_SERVER_ERROR_RESPONSES; index += 1) {
      recordServerErrorResponse(
        { method: 'GET', url: `/overflow/${index}` },
        { status: 500, body: { message: `failure ${index}` } },
      )
    }

    const recorded = takeRecordedServerErrorResponses()
    expect(recorded).toHaveLength(MAX_RECORDED_SERVER_ERROR_RESPONSES)
    expect(recorded[0]!.url).toBe('/overflow/1')
    expect(recorded.at(-1)!.url).toBe(`/overflow/${MAX_RECORDED_SERVER_ERROR_RESPONSES}`)
  })

  // Runs last: vi.resetModules() repoints the shared test server at a fresh app instance.
  it('shares one buffer with a server helper re-evaluated by vi.resetModules()', async () => {
    vi.resetModules()
    const fresh = await import('@voucha/test-helpers/api/server')
    const { default: freshApp } = await import('@voucha/api/app')
    const resetPath = '/api/v1/__tests__/server-error-responses-reset-boom'
    freshApp.route(resetPath).get(() => {
      throw new Error('thrown after module reset')
    })

    await fresh.createRequest().get(resetPath).expect(500)

    expect(takeRecordedServerErrorResponses()).toEqual([
      expect.objectContaining({
        url: expect.stringContaining(resetPath),
        body: expect.objectContaining({ message: 'thrown after module reset' }),
      }),
    ])
  })
})
