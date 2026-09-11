import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.hoisted(() =>
  vi.fn<(command: { input: unknown }) => Promise<{ Parameter?: { Value?: string } }>>(),
)

vi.mock<typeof import('@aws-sdk/client-ssm')>(
  import('@aws-sdk/client-ssm'),
  async importOriginal => {
    const actual = await importOriginal<typeof import('@aws-sdk/client-ssm')>()

    class GetParameterCommand {
      input: unknown

      constructor(input: unknown) {
        this.input = input
      }
    }

    class SSMClient {
      send = sendMock
    }

    return {
      ...actual,
      GetParameterCommand: GetParameterCommand as unknown as typeof actual.GetParameterCommand,
      SSMClient: SSMClient as unknown as typeof actual.SSMClient,
    }
  },
)

async function loadResolver() {
  return await import('./ssm-secret.mts')
}

describe('runtime SSM secret resolver', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.useRealTimers()
    delete process.env.RUNTIME_SECRET
    delete process.env.RUNTIME_SECRET_PARAMETER
    sendMock.mockReset()
  })

  // The "loads and caches" test below switches to fake timers to advance past the cache TTL.
  // The next test's beforeEach also resets real timers, but that only holds if a next test
  // exists in the same run — this restores unconditionally, on any exit path (pass, fail, or
  // this test running alone), so fake timers can never leak past this file.
  afterEach(() => {
    vi.useRealTimers()
  })

  it('prefers a direct environment value over SSM', async () => {
    vi.stubEnv('RUNTIME_SECRET', 'direct-secret')
    vi.stubEnv('RUNTIME_SECRET_PARAMETER', '/voucha/staging/runtime-secret')

    const { resolveRuntimeSecret } = await loadResolver()

    await expect(
      resolveRuntimeSecret({
        parameterEnvName: 'RUNTIME_SECRET_PARAMETER',
        valueEnvName: 'RUNTIME_SECRET',
      }),
    ).resolves.toBe('direct-secret')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('rejects a direct placeholder environment value', async () => {
    vi.stubEnv('RUNTIME_SECRET', 'PLACEHOLDER')

    const { resolveRuntimeSecret } = await loadResolver()

    await expect(
      resolveRuntimeSecret({
        parameterEnvName: 'RUNTIME_SECRET_PARAMETER',
        valueEnvName: 'RUNTIME_SECRET',
      }),
    ).rejects.toThrow('RUNTIME_SECRET is still set to the placeholder value')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('loads and caches a decrypted SSM parameter value until the TTL expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.stubEnv('RUNTIME_SECRET_PARAMETER', '/voucha/staging/runtime-secret')
    sendMock
      .mockResolvedValueOnce({ Parameter: { Value: 'ssm-secret' } })
      .mockResolvedValueOnce({ Parameter: { Value: 'rotated-secret' } })

    const { resolveRuntimeSecret } = await loadResolver()
    const options = {
      parameterEnvName: 'RUNTIME_SECRET_PARAMETER',
      valueEnvName: 'RUNTIME_SECRET',
    }

    await expect(resolveRuntimeSecret(options)).resolves.toBe('ssm-secret')
    delete process.env.RUNTIME_SECRET
    await expect(resolveRuntimeSecret(options)).resolves.toBe('ssm-secret')
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await expect(resolveRuntimeSecret(options)).resolves.toBe('rotated-secret')

    expect(sendMock).toHaveBeenCalledTimes(2)
    expect(sendMock.mock.calls[0]?.[0].input).toEqual({
      Name: '/voucha/staging/runtime-secret',
      WithDecryption: true,
    })
    expect(process.env.RUNTIME_SECRET).toBeUndefined()
  })

  it('returns undefined when neither a value nor parameter name is configured', async () => {
    const { resolveRuntimeSecret } = await loadResolver()

    await expect(
      resolveRuntimeSecret({
        parameterEnvName: 'RUNTIME_SECRET_PARAMETER',
        valueEnvName: 'RUNTIME_SECRET',
      }),
    ).resolves.toBeUndefined()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('throws when SSM returns no parameter value', async () => {
    vi.stubEnv('RUNTIME_SECRET_PARAMETER', '/voucha/staging/runtime-secret')
    sendMock.mockResolvedValue({ Parameter: {} })

    const { resolveRuntimeSecret } = await loadResolver()

    await expect(
      resolveRuntimeSecret({
        parameterEnvName: 'RUNTIME_SECRET_PARAMETER',
        valueEnvName: 'RUNTIME_SECRET',
      }),
    ).rejects.toThrow('SSM parameter /voucha/staging/runtime-secret did not contain a value')
  })

  it('throws when SSM returns the placeholder value', async () => {
    vi.stubEnv('RUNTIME_SECRET_PARAMETER', '/voucha/staging/runtime-secret')
    sendMock.mockResolvedValue({ Parameter: { Value: 'PLACEHOLDER' } })

    const { resolveRuntimeSecret } = await loadResolver()

    await expect(
      resolveRuntimeSecret({
        parameterEnvName: 'RUNTIME_SECRET_PARAMETER',
        valueEnvName: 'RUNTIME_SECRET',
      }),
    ).rejects.toThrow(
      'SSM parameter /voucha/staging/runtime-secret is still set to the placeholder value',
    )
  })
})
