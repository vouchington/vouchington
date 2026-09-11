import { describe, it, expect, vi, afterEach } from 'vitest'
import type { InitSentryOptions } from './sentry.mts'
import { getBeforeSend } from './sentry.mock-test-helpers.mts'

vi.mock<typeof import('@sentry/aws-serverless')>(import('@sentry/aws-serverless'), () => ({
  init: vi.fn<VitestLooseMock>(),
  captureException: vi.fn<VitestLooseMock>(),
}))

const Sentry = await import('@sentry/aws-serverless')
const { initSentry } = await import('./sentry.mts')

type BeforeSend = NonNullable<InitSentryOptions['beforeSend']>
type SentryEvent = Parameters<BeforeSend>[0]
type SentryEventHint = Parameters<BeforeSend>[1]

describe('initSentry event scrubbing', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('scrubs sensitive fields from events and breadcrumbs by default', async () => {
    process.env.NODE_ENV = 'test'
    initSentry({ lambdaName: 'test-lambda' })
    const result = await getBeforeSend(vi.mocked(Sentry.init))(
      {
        user: { id: 'user-1', email: 'tests+person@voucha.ai' },
        request: {
          headers: {
            authorization: 'Bearer abc123',
            cookie: 'session=abc',
            'x-request-id': 'request-1',
          },
          data: {
            nested: {
              token: 'secret-token',
              message: 'contact tests+ops@voucha.ai with token=abc123',
            },
          },
        },
        breadcrumbs: [
          {
            message: 'called apiKey=abc123 for tests+admin@voucha.ai',
            data: { accessToken: 'abc123', route: '/resize' },
          },
        ],
      } as unknown as SentryEvent,
      {} as SentryEventHint,
    )

    expect(result).toMatchObject({
      user: { id: 'user-1', email: '[Filtered]' },
      request: {
        headers: {
          authorization: '[Filtered]',
          cookie: '[Filtered]',
          'x-request-id': 'request-1',
        },
        data: {
          nested: {
            token: '[Filtered]',
            message: 'contact [Filtered email] with token=[Filtered token]',
          },
        },
      },
      breadcrumbs: [
        {
          message: 'called apiKey=[Filtered token] for [Filtered email]',
          data: { accessToken: '[Filtered]', route: '/resize' },
        },
      ],
    })
  })

  it('scrubs request URLs after a custom beforeSend hook', async () => {
    const beforeSend = vi.fn<BeforeSend>(event => ({
      ...event,
      request: { url: 'https://example.com/verify?token=secret' },
    }))
    initSentry({ lambdaName: 'test-lambda', beforeSend })

    expect(
      await getBeforeSend(vi.mocked(Sentry.init))({} as SentryEvent, {} as SentryEventHint),
    ).toMatchObject({ request: { url: 'https://example.com/verify' } })
  })
})
