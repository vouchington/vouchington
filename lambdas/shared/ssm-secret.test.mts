import { randomUUID } from 'node:crypto'
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Parameters live in the AWS Emulator; each test names its own so concurrent forks never collide.

async function putParameter(Value: string, Overwrite = false): Promise<string> {
  const name = `/voucha/test/${randomUUID()}/runtime-secret`
  await putNamedParameter(name, Value, Overwrite)
  return name
}

async function putNamedParameter(Name: string, Value: string, Overwrite: boolean) {
  // A client per write: one that signed under a faked clock would carry its skew correction on.
  const ssm = new SSMClient({ region: 'us-west-2' })
  try {
    await ssm.send(new PutParameterCommand({ Name, Value, Type: 'SecureString', Overwrite }))
  } finally {
    ssm.destroy()
  }
}

async function loadResolver() {
  return import('./ssm-secret.mts')
}

const options = {
  parameterEnvName: 'RUNTIME_SECRET_PARAMETER',
  valueEnvName: 'RUNTIME_SECRET',
}

describe('runtime SSM secret resolver', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.stubEnv('AWS_REGION', 'us-west-2')
    delete process.env.RUNTIME_SECRET
    delete process.env.RUNTIME_SECRET_PARAMETER
  })

  // The "loads and caches" test below fakes `Date` to advance past the cache TTL; this restores
  // it on every exit path so a fake clock can never leak past this file.
  afterEach(() => {
    vi.useRealTimers()
  })

  it('prefers a direct environment value over SSM', async () => {
    vi.stubEnv('RUNTIME_SECRET', 'direct-secret')
    vi.stubEnv('RUNTIME_SECRET_PARAMETER', `/voucha/test/${randomUUID()}/never-read`)

    const { resolveRuntimeSecret } = await loadResolver()

    // The parameter does not exist, so a read would reject instead of resolving.
    await expect(resolveRuntimeSecret(options)).resolves.toBe('direct-secret')
  })

  it('rejects a direct placeholder environment value', async () => {
    vi.stubEnv('RUNTIME_SECRET', 'PLACEHOLDER')

    const { resolveRuntimeSecret } = await loadResolver()

    await expect(resolveRuntimeSecret(options)).rejects.toThrow(
      'RUNTIME_SECRET is still set to the placeholder value',
    )
  })

  it('loads and caches a decrypted SSM parameter value until the TTL expires', async () => {
    // Only the clock is faked: the request to the emulator is real I/O.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const name = await putParameter('ssm-secret')
    vi.stubEnv('RUNTIME_SECRET_PARAMETER', name)

    const { resolveRuntimeSecret } = await loadResolver()

    await expect(resolveRuntimeSecret(options)).resolves.toBe('ssm-secret')
    await putNamedParameter(name, 'rotated-secret', true)
    await expect(resolveRuntimeSecret(options)).resolves.toBe('ssm-secret')
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await expect(resolveRuntimeSecret(options)).resolves.toBe('rotated-secret')
    expect(process.env.RUNTIME_SECRET).toBeUndefined()
  })

  it('returns undefined when neither a value nor parameter name is configured', async () => {
    const { resolveRuntimeSecret } = await loadResolver()

    await expect(resolveRuntimeSecret(options)).resolves.toBeUndefined()
  })

  it('throws when the SSM parameter does not exist', async () => {
    vi.stubEnv('RUNTIME_SECRET_PARAMETER', `/voucha/test/${randomUUID()}/missing`)

    const { resolveRuntimeSecret } = await loadResolver()

    await expect(resolveRuntimeSecret(options)).rejects.toMatchObject({ name: 'ParameterNotFound' })
  })

  it('throws when the SSM parameter holds only whitespace', async () => {
    const name = await putParameter(' ')
    vi.stubEnv('RUNTIME_SECRET_PARAMETER', name)

    const { resolveRuntimeSecret } = await loadResolver()

    await expect(resolveRuntimeSecret(options)).rejects.toThrow(
      `SSM parameter ${name} did not contain a value`,
    )
  })

  it('throws when SSM returns the placeholder value', async () => {
    const name = await putParameter('PLACEHOLDER')
    vi.stubEnv('RUNTIME_SECRET_PARAMETER', name)

    const { resolveRuntimeSecret } = await loadResolver()

    await expect(resolveRuntimeSecret(options)).rejects.toThrow(
      `SSM parameter ${name} is still set to the placeholder value`,
    )
  })
})
