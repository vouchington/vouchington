import { beforeEach, describe, expect, it, vi } from 'vitest'
import manifest from '../../../../api-fixtures/v1/manifest.json'

const {
  mockClientDelete,
  mockClientFetch,
  mockClientGet,
  mockClientPatch,
  mockClientPost,
  mockClientPut,
  mockServerGet,
} = vi.hoisted(() => ({
  mockClientDelete: vi.fn<VitestLooseMock>(),
  mockClientFetch: vi.fn<typeof import('../client/raw-fetch').clientFetch>(),
  mockClientGet: vi.fn<VitestLooseMock>(),
  mockClientPatch: vi.fn<VitestLooseMock>(),
  mockClientPost: vi.fn<VitestLooseMock>(),
  mockClientPut: vi.fn<VitestLooseMock>(),
  mockServerGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('../client/instance'),
  () =>
    ({
      clientApi: {
        delete: mockClientDelete,
        get: mockClientGet,
        patch: mockClientPatch,
        post: mockClientPost,
        put: mockClientPut,
      },
    }) as unknown as typeof import('../client/instance'),
)

vi.mock(
  import('../client/raw-fetch'),
  () =>
    ({
      clientFetch: mockClientFetch,
    }) as unknown as typeof import('../client/raw-fetch'),
)

vi.mock(
  import('../server/instance'),
  () =>
    ({
      serverApi: { get: mockServerGet },
    }) as unknown as typeof import('../server/instance'),
)

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

import { WEB_API_FIXTURE_DECLARATIONS } from '@/test-helpers/api-responses/declarations'
import type { WebApiFixtureDeclaration } from '@/test-helpers/api-responses/declarations/declaration'
import { WEB_FIXTURE_ENDPOINT_CONTEXT } from '../../../test-helpers/lib/api/api-fixture-endpoint-context'

interface CapturedRequest {
  method: string
  path: string
  body: unknown
  query: Record<string, string>
}

const apiMocks = [
  { method: 'GET', mock: mockClientGet },
  { method: 'PUT', mock: mockClientPut },
  { method: 'POST', mock: mockClientPost },
  { method: 'PATCH', mock: mockClientPatch },
  { method: 'DELETE', mock: mockClientDelete },
  { method: 'GET', mock: mockServerGet },
]

function webManifestFixtures() {
  return manifest.fixtures.filter(entry => entry.consumers.includes('web') && entry.route)
}

function normalizeSearchParams(options: unknown): Record<string, string> {
  if (!options || typeof options !== 'object' || !('searchParams' in options)) return {}
  const searchParams = (options as { searchParams?: Record<string, unknown> }).searchParams
  if (!searchParams) return {}
  return Object.fromEntries(
    Object.entries(searchParams)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)]),
  )
}

function captureSingleRequest(): CapturedRequest {
  const apiCalls = apiMocks.flatMap(entry =>
    entry.mock.mock.calls.map(args => ({ args: args as unknown[], method: entry.method })),
  )
  const rawFetchCalls = mockClientFetch.mock.calls.map(([input, init]) => ({
    args: [String(input), init?.body] as unknown[],
    method: init?.method ?? 'GET',
  }))
  const calls = [...apiCalls, ...rawFetchCalls]
  if (calls.length !== 1) {
    throw new Error(`Expected exactly one API request, received ${calls.length}`)
  }

  const { args, method } = calls[0]!
  const [rawPath, secondArgument] = args as [string, unknown]
  const url = new URL(rawPath, 'https://fixture.test')
  return {
    method,
    path: url.pathname,
    body: method === 'GET' ? undefined : secondArgument,
    query: { ...Object.fromEntries(url.searchParams), ...normalizeSearchParams(secondArgument) },
  }
}

function clearApiMocks() {
  for (const entry of apiMocks) entry.mock.mockClear()
  mockClientFetch.mockClear()
}

async function captureDeclarationRequest(
  declaration: Pick<WebApiFixtureDeclaration<string, unknown>, 'invoke'>,
): Promise<CapturedRequest> {
  clearApiMocks()
  await declaration.invoke(WEB_FIXTURE_ENDPOINT_CONTEXT)
  return captureSingleRequest()
}

describe('web API fixture endpoint coverage', () => {
  beforeEach(() => {
    for (const entry of apiMocks) {
      entry.mock.mockReset()
      entry.mock.mockResolvedValue({})
    }
    mockClientFetch.mockReset()
    const dataRequestBody = JSON.stringify({
      id: 'data-request-abc',
      status: 'pending',
      created_at: '2026-07-01T16:00:00Z',
      expires_at: null,
    })
    const responseInit = { status: 200, headers: { 'Content-Type': 'application/json' } }
    // oxlint-disable-next-line vitest/prefer-mock-return-shorthand, vitest/prefer-mock-promise-shorthand -- each declaration needs a fresh, unconsumed response body.
    mockClientFetch.mockImplementation(() =>
      Promise.resolve(new Response(dataRequestBody, responseInit)),
    )
  })

  it('rejects declarations that call no endpoint', async () => {
    const declaration = { invoke: async () => {} }

    await expect(captureDeclarationRequest(declaration)).rejects.toThrow(
      'Expected exactly one API request, received 0',
    )
  })

  it('rejects declarations that call one recorder twice', async () => {
    await mockClientGet('/first')
    await mockClientGet('/second')

    expect(() => captureSingleRequest()).toThrow('Expected exactly one API request, received 2')
  })

  it('rejects declarations that call two different recorders', async () => {
    await mockClientGet('/client')
    await mockServerGet('/server')

    expect(() => captureSingleRequest()).toThrow('Expected exactly one API request, received 2')
  })

  it('matches every web declaration to its manifest request contract', async () => {
    for (const declaration of WEB_API_FIXTURE_DECLARATIONS) {
      const fixture = manifest.fixtures.find(entry => entry.id === declaration.id)
      if (!fixture) {
        throw new Error(`${declaration.id} is not present in api-fixtures/v1/manifest.json.`)
      }

      const invocations = [declaration.invoke, ...(declaration.additionalInvocations ?? [])]
      for (const [invocationIndex, invoke] of invocations.entries()) {
        const request = await captureDeclarationRequest({ invoke })
        expect({ fixtureId: declaration.id, invocationIndex, ...request }).toEqual({
          fixtureId: declaration.id,
          invocationIndex,
          method: fixture.method,
          path: fixture.path,
          body: 'requestBody' in fixture ? fixture.requestBody : undefined,
          query: fixture.query ?? {},
        })
      }
    }
  })

  it('passes the complete landing-page mutation body through its wrapper', async () => {
    const declaration = WEB_API_FIXTURE_DECLARATIONS.find(
      entry => entry.id === 'native.landing-page-items-mutation.default',
    )!
    const fixture = manifest.fixtures.find(entry => entry.id === declaration.id)!

    await declaration.invoke(WEB_FIXTURE_ENDPOINT_CONTEXT)

    expect(captureSingleRequest().body).toEqual(
      'requestBody' in fixture ? fixture.requestBody : undefined,
    )
  })

  it('registers exactly every web-consumed route fixture', () => {
    expect(WEB_API_FIXTURE_DECLARATIONS.map(entry => entry.id).toSorted()).toEqual(
      webManifestFixtures()
        .map(entry => entry.id)
        .toSorted(),
    )
  })
})
