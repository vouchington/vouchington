import { describe, expect, it, vi } from 'vitest'
import { createVouchaSentryInitOptions } from './sentry-init-options.mts'

const DSN = 'https://public@example.test/123'

describe('createVouchaSentryInitOptions', () => {
  it.each(['staging', 'production', 'Production'])(
    'enables reporting for the deployed environment %s with a valid DSN',
    environment => {
      expect(createVouchaSentryInitOptions({ dsn: DSN, environment })).toMatchObject({
        dsn: DSN,
        enabled: true,
        environment,
      })
    },
  )

  it.each([undefined, 'test', 'development', 'ci-main', ''])(
    'fails closed for the environment %s',
    environment => {
      expect(createVouchaSentryInitOptions({ dsn: DSN, environment }).enabled).toBe(false)
    },
  )

  it('disables a deployed environment whose DSN is missing or invalid and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const dsn of [undefined, 'http://public@example.test/123']) {
      expect(createVouchaSentryInitOptions({ dsn, environment: 'production' })).toMatchObject({
        dsn: undefined,
        enabled: false,
      })
    }
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('applies the product credential and URL policy to events, breadcrumbs and spans', async () => {
    const options = createVouchaSentryInitOptions({ dsn: DSN, environment: 'production' })

    expect(options.dataCollection.httpHeaders).toMatchObject({
      request: { deny: expect.arrayContaining(['x-forwarded-for', 'x-app-attest-assertion']) },
    })
    expect(
      await options.beforeSend(
        {
          request: {
            headers: { 'X-Voucha-Cache-Purge-Secret': 'purge', 'x-request-id': 'request-1' },
            url: 'https://example.com/x?token=secret',
          },
          user: { email: 'person@example.test' },
        } as never,
        {},
      ),
    ).toEqual({
      request: {
        headers: { 'X-Voucha-Cache-Purge-Secret': '[Filtered]', 'x-request-id': 'request-1' },
        url: 'https://example.com/x',
      },
      user: { email: '[Filtered]' },
    })
    expect(
      options.beforeSendSpan({
        attributes: { 'http.request.header.x_app_attest_nonce': 'nonce' },
      } as never).attributes,
    ).toEqual({ 'http.request.header.x_app_attest_nonce': '[Filtered]' })
    expect(options.beforeBreadcrumb({ message: 'sent to person@example.test' } as never)).toEqual({
      message: 'sent to [Filtered email]',
    })
  })
})
