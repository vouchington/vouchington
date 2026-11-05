import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatConsoleError, consoleContext } from './console-format.mts'

describe('deployed console error privacy', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    'provider failed {"access_token":"synthetic-console-secret"}',
    'Incorrect API key provided: synthetic-console-secret',
  ])('omits credentials echoed in provider error text: %s', message => {
    expect(formatConsoleError(new Error(message))).not.toContain('synthetic-console-secret')
  })

  it('prints class, numeric statuses, validated code and frames, without message or custom fields', () => {
    const error = Object.assign(
      new TypeError('https://user:password@example.test/path?code=private-code#fragment'),
      {
        code: 'UND_ERR_CONNECT_TIMEOUT',
        status: 503,
        statusCode: 502,
        config: { authorization: 'private-header' },
      },
    )
    const output = formatConsoleError(error)

    expect(output).toContain('TypeError:')
    expect(output).toContain('console-format.test.mts')
    expect(output).toContain('"code":"UND_ERR_CONNECT_TIMEOUT"')
    expect(output).toContain('"status":503')
    expect(output).toContain('"statusCode":502')
    for (const secret of ['user:', 'password', 'private-code', 'fragment', 'private-header']) {
      expect(output).not.toContain(secret)
    }
  })

  it.each(['Bearer private-code', 'private-code\nsecret', 'x'.repeat(65), 42])(
    'omits an invalid diagnostic code %s',
    code => {
      expect(
        formatConsoleError(Object.assign(new Error('private-message'), { code })),
      ).not.toContain('"code":')
    },
  )

  it('bounds cause metadata and never emits cause messages or custom properties', () => {
    const deepest = Object.assign(new Error('private-deepest'), { code: 'DEEP_4' })
    const third = Object.assign(new Error('private-third', { cause: deepest }), { code: 'DEPTH_3' })
    const second = Object.assign(new Error('private-second', { cause: third }), { code: 'DEPTH_2' })
    const first = Object.assign(new TypeError('private-first', { cause: second }), {
      code: 'DEPTH_1',
      token: 'private-token',
    })
    const output = formatConsoleError(new Error('private-top', { cause: first }))

    expect(output).toContain('DEPTH_1')
    expect(output).toContain('DEPTH_2')
    expect(output).toContain('DEPTH_3')
    expect(output).not.toContain('DEEP_4')
    expect(output).not.toContain('private-')
  })

  it('removes multiline message frames before selecting actual stack locations', () => {
    const error = new Error('private-message\n    at private-secret (/fake/file:1:2)')
    const output = formatConsoleError(error)

    expect(output).not.toContain('private-secret')
    expect(output).not.toContain('/fake/file')
    expect(output).toContain('console-format.test.mts')
    error.stack = 'unexpected-private-header\n    at private-frame (/fake/file:1:2)'
    expect(formatConsoleError(error)).not.toContain('private-frame')
  })

  it('keeps deployed recorder counts but omits every free-form context string', () => {
    vi.stubEnv('NODE_ENV', 'staging')
    vi.stubEnv('CI', '')
    expect(
      consoleContext({
        count: 3,
        status: 503,
        invalid: Number.NaN,
        path: '/oncall/integrations/v1/formatted_webhook/private-grafana/heartbeat',
        message: 'Bearer private-bearer https://[malformed/private-url?code=private-code',
        url: 'https://user:password@example.test/path?code=private-query#private-fragment',
        token: 'private-token',
        nested: { secret: 'private-nested' },
      }),
    ).toEqual({ count: 3, status: 503 })
  })

  it.each([
    ['development', ''],
    ['production', 'true'],
  ])('keeps the existing full recorder output in %s with CI=%s', (environment, ci) => {
    vi.stubEnv('NODE_ENV', environment)
    vi.stubEnv('CI', ci)
    const context = { model: 'full-development-model' }
    expect(consoleContext(context)).toBe(context)
  })

  it('retains a safe fatal diagnostic when an error cannot supply a stack', () => {
    const error = new Error('private-message')
    Object.defineProperty(error, 'stack', {
      get() {
        throw new Error('private-stack-failure')
      },
    })
    expect(formatConsoleError(error)).toBe('Error: [Unavailable error metadata]')
  })
})
