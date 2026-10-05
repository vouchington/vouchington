import { describe, expect, it, vi } from 'vitest'
import {
  DSA_TEST_UUID,
  dsaTestDuplicateResponse,
  dsaTestPayload,
  dsaTestResponse,
} from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import { submitDsaTransparencyDatabaseStatement } from './dsa-transparency-database-client.mts'

const credentials = {
  url: 'https://transparency.dsa.ec.europa.eu/api/v1',
  token: 'synthetic-test-token',
}

function fakeFetch(response: Response) {
  return vi.fn<(_input: string | URL | Request, _init?: RequestInit) => Promise<Response>>(
    async () => response,
  )
}

describe('DSA Transparency Database HTTP boundary', () => {
  it('submits only the validated public payload with bearer auth to the single-item endpoint', async () => {
    const payload = dsaTestPayload()
    const request = fakeFetch(dsaTestResponse(201, { uuid: DSA_TEST_UUID }))
    await expect(
      submitDsaTransparencyDatabaseStatement(payload, credentials, request),
    ).resolves.toEqual({ kind: 'submitted', uuid: DSA_TEST_UUID, statusCode: 201 })
    expect(request).toHaveBeenCalledTimes(1)
    const [url, init] = request.mock.calls[0]!
    expect(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).toBe(
      `${credentials.url}/statement`,
    )
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('treats the Commission duplicate-puid shape as a submitted statement', async () => {
    const request = fakeFetch(dsaTestDuplicateResponse())
    await expect(
      submitDsaTransparencyDatabaseStatement(dsaTestPayload(), credentials, request),
    ).resolves.toEqual({ kind: 'submitted', uuid: DSA_TEST_UUID, statusCode: 422 })
  })

  it.each([
    [
      422,
      dsaTestResponse(422, { message: 'schema error', errors: { puid: ['invalid'] } }),
      'permanent_failure',
    ],
    [422, new Response('not-json', { status: 422 }), 'permanent_failure'],
    [401, dsaTestResponse(401, { message: 'bad token' }), 'retryable_failure'],
    [429, new Response(null, { status: 429 }), 'retryable_failure'],
    [503, new Response(null, { status: 503 }), 'retryable_failure'],
    [400, new Response(null, { status: 400 }), 'permanent_failure'],
  ] as const)(
    'classifies HTTP %i without exposing the response body',
    async (status, response, kind) => {
      await expect(
        submitDsaTransparencyDatabaseStatement(dsaTestPayload(), credentials, fakeFetch(response)),
      ).resolves.toEqual({ kind, statusCode: status, errorCode: `http_${status}` })
    },
  )

  it('retries a malformed success and a network failure', async () => {
    await expect(
      submitDsaTransparencyDatabaseStatement(
        dsaTestPayload(),
        credentials,
        fakeFetch(dsaTestResponse(201, { uuid: 'not-a-uuid' })),
      ),
    ).resolves.toEqual({
      kind: 'retryable_failure',
      statusCode: 201,
      errorCode: 'invalid_response',
    })
    const disconnected = vi.fn<() => Promise<Response>>(async () => {
      throw new Error('connection lost')
    })
    await expect(
      submitDsaTransparencyDatabaseStatement(dsaTestPayload(), credentials, disconnected),
    ).resolves.toEqual({ kind: 'retryable_failure', statusCode: null, errorCode: 'network_error' })
  })

  it.each([
    { url: '', token: 'token' },
    { url: 'not-a-url', token: 'token' },
    { url: credentials.url, token: '' },
    { url: 'http://transparency.dsa.ec.europa.eu/api/v1', token: 'token' },
    { url: 'https://attacker.example/api/v1', token: 'token' },
    { url: 'https://token@transparency.dsa.ec.europa.eu/api/v1', token: 'token' },
  ])('does not call fetch with absent credentials or an unsafe endpoint', async invalid => {
    const request = fakeFetch(dsaTestResponse(201, { uuid: DSA_TEST_UUID }))
    await expect(
      submitDsaTransparencyDatabaseStatement(dsaTestPayload(), invalid, request),
    ).resolves.toEqual({ kind: 'configuration_missing' })
    expect(request).not.toHaveBeenCalled()
  })
})
