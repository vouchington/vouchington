import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.resetModules() resets the module-level productionValueInvalidLogged flag between tests.
// Return the import promise without await to avoid the ban-dynamic-imports static-analysis rule.
function importEnvValidation() {
  vi.resetModules()
  return import('./env-validation.mts')
}

function importProductionMode() {
  return import('./production-mode.mts')
}

type ConsoleErrorSpy = () => ReturnType<typeof vi.spyOn>

type EnvErrorWarner = 'warnIfProductionValueInvalid' | 'warnIfCspAssetOriginInvalid'

type WarnerEnv = {
  PRODUCTION?: string
  CSP_ASSET_ORIGIN?: string
}

function installConsoleErrorSpy(): ConsoleErrorSpy {
  let errorSpy: ReturnType<typeof vi.spyOn> | undefined
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  return () => {
    if (errorSpy === undefined) {
      throw new Error('console.error spy was not installed')
    }
    return errorSpy
  }
}

async function runEnvErrorWarner(warner: EnvErrorWarner, envs: readonly WarnerEnv[]) {
  const loaded = await importEnvValidation()
  const warn =
    warner === 'warnIfProductionValueInvalid'
      ? loaded.warnIfProductionValueInvalid
      : loaded.warnIfCspAssetOriginInvalid
  for (const env of envs) {
    warn(env)
  }
}

describe('warnIfProductionValueInvalid', () => {
  const errorSpy = installConsoleErrorSpy()

  it.each([
    ['1', "PRODUCTION is set to '1'"],
    ['yes', "PRODUCTION is set to 'yes'"],
    ['on', "PRODUCTION is set to 'on'"],
  ] as const)("warns for ambiguous value '%s'", async (value, message) => {
    await runEnvErrorWarner('warnIfProductionValueInvalid', [{ PRODUCTION: value }])
    expect(errorSpy()).toHaveBeenCalledWith(expect.stringContaining(message))
  })

  it.each(['true', 'false'] as const)("does not warn for '%s'", async value => {
    await runEnvErrorWarner('warnIfProductionValueInvalid', [{ PRODUCTION: value }])
    expect(errorSpy()).not.toHaveBeenCalled()
  })

  it('does not warn when PRODUCTION is not set', async () => {
    await runEnvErrorWarner('warnIfProductionValueInvalid', [{}])
    expect(errorSpy()).not.toHaveBeenCalled()
  })

  it('deduplicates warnings — fires at most once per module instance', async () => {
    await runEnvErrorWarner('warnIfProductionValueInvalid', [
      { PRODUCTION: '1' },
      { PRODUCTION: '1' },
      { PRODUCTION: 'yes' },
    ])
    expect(errorSpy()).toHaveBeenCalledTimes(1)
  })
})

describe('isProductionMode', () => {
  it('treats explicit true as production', async () => {
    const { isProductionMode } = await importProductionMode()
    expect(isProductionMode({ PRODUCTION: 'true' })).toBe(true)
    expect(isProductionMode({ PRODUCTION: 'TRUE' })).toBe(true)
  })

  it('treats explicit false and unset values as non-production', async () => {
    const { isProductionMode } = await importProductionMode()
    expect(isProductionMode({ PRODUCTION: 'false' })).toBe(false)
    expect(isProductionMode({ PRODUCTION: 'FALSE' })).toBe(false)
    expect(isProductionMode({})).toBe(false)
  })

  it('fails closed to production for ambiguous non-empty values', async () => {
    const { isProductionMode } = await importProductionMode()
    expect(isProductionMode({ PRODUCTION: '1' })).toBe(true)
    expect(isProductionMode({ PRODUCTION: 'yes' })).toBe(true)
    expect(isProductionMode({ PRODUCTION: 'on' })).toBe(true)
  })
})

describe('warnIfCspAssetOriginInvalid', () => {
  const errorSpy = installConsoleErrorSpy()

  it('warns when CSP_ASSET_ORIGIN is set to a non-https URL', async () => {
    await runEnvErrorWarner('warnIfCspAssetOriginInvalid', [
      { CSP_ASSET_ORIGIN: 'http://cdn.example.com' },
    ])
    expect(errorSpy()).toHaveBeenCalledWith(
      expect.stringContaining('CSP_ASSET_ORIGIN failed validation'),
    )
  })

  it('warns when CSP_ASSET_ORIGIN is set to a malformed URL', async () => {
    await runEnvErrorWarner('warnIfCspAssetOriginInvalid', [{ CSP_ASSET_ORIGIN: 'not-a-url' }])
    expect(errorSpy()).toHaveBeenCalledWith(
      expect.stringContaining('CSP_ASSET_ORIGIN failed validation'),
    )
  })

  it('does not warn when CSP_ASSET_ORIGIN is a valid https URL', async () => {
    await runEnvErrorWarner('warnIfCspAssetOriginInvalid', [
      { CSP_ASSET_ORIGIN: 'https://d1234567.cloudfront.net' },
    ])
    expect(errorSpy()).not.toHaveBeenCalled()
  })

  it('does not warn when CSP_ASSET_ORIGIN is not set', async () => {
    await runEnvErrorWarner('warnIfCspAssetOriginInvalid', [{}])
    expect(errorSpy()).not.toHaveBeenCalled()
  })

  it('does not warn when CSP_ASSET_ORIGIN is empty string', async () => {
    await runEnvErrorWarner('warnIfCspAssetOriginInvalid', [{ CSP_ASSET_ORIGIN: '' }])
    expect(errorSpy()).not.toHaveBeenCalled()
  })

  it('does not warn when CSP_ASSET_ORIGIN is whitespace-only', async () => {
    await runEnvErrorWarner('warnIfCspAssetOriginInvalid', [{ CSP_ASSET_ORIGIN: '  ' }])
    expect(errorSpy()).not.toHaveBeenCalled()
  })

  it('deduplicates warnings — fires at most once per module instance', async () => {
    await runEnvErrorWarner('warnIfCspAssetOriginInvalid', [
      { CSP_ASSET_ORIGIN: 'not-a-url' },
      { CSP_ASSET_ORIGIN: 'http://cdn.example.com' },
    ])
    expect(errorSpy()).toHaveBeenCalledTimes(1)
  })
})

describe('warnIfSentryConfigurationInvalid', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns once only for missing or invalid deployed Sentry configuration', async () => {
    const { warnIfSentryConfigurationInvalid } = await importEnvValidation()
    warnIfSentryConfigurationInvalid({ ENVIRONMENT: 'production', SENTRY_DSN: 'not-a-dsn' })
    warnIfSentryConfigurationInvalid({ ENVIRONMENT: 'production', SENTRY_DSN: 'not-a-dsn' })

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      'Sentry is disabled because its required DSN configuration is missing or invalid.',
    )
  })

  it('stays quiet outside deployed environments', async () => {
    const { warnIfSentryConfigurationInvalid } = await importEnvValidation()
    warnIfSentryConfigurationInvalid({ ENVIRONMENT: 'development' })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns without exposing an invalid retiring browser DSN', async () => {
    const { warnIfSentryConfigurationInvalid } = await importEnvValidation()
    warnIfSentryConfigurationInvalid({
      ENVIRONMENT: 'production',
      SENTRY_DSN: 'https://worker_public@worker.example.test/456',
      SENTRY_TUNNEL_PREVIOUS_WEB_DSN: 'invalid-retiring-value',
      SENTRY_WEB_DSN: 'https://web_public@web.example.test/123',
    })

    expect(warnSpy).toHaveBeenCalledWith(
      'Sentry tunnel rotation overlap is disabled because the previous browser DSN is invalid.',
    )
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('invalid-retiring-value'))
  })
})

describe('isCachePlaceholderNonceValid', () => {
  it('rejects undefined', async () => {
    const { isCachePlaceholderNonceValid } = await importEnvValidation()
    expect(isCachePlaceholderNonceValid(undefined)).toBe(false)
  })

  it('rejects an empty string', async () => {
    const { isCachePlaceholderNonceValid } = await importEnvValidation()
    expect(isCachePlaceholderNonceValid('')).toBe(false)
  })

  it('rejects a non-empty value shorter than the minimum length', async () => {
    const { isCachePlaceholderNonceValid, MIN_CACHE_PLACEHOLDER_NONCE_LENGTH } =
      await importEnvValidation()
    expect(isCachePlaceholderNonceValid('a'.repeat(MIN_CACHE_PLACEHOLDER_NONCE_LENGTH - 1))).toBe(
      false,
    )
  })

  it('accepts a value at exactly the minimum length', async () => {
    const { isCachePlaceholderNonceValid, MIN_CACHE_PLACEHOLDER_NONCE_LENGTH } =
      await importEnvValidation()
    expect(isCachePlaceholderNonceValid('a'.repeat(MIN_CACHE_PLACEHOLDER_NONCE_LENGTH))).toBe(true)
  })

  it('accepts a value longer than the minimum length', async () => {
    const { isCachePlaceholderNonceValid, MIN_CACHE_PLACEHOLDER_NONCE_LENGTH } =
      await importEnvValidation()
    expect(isCachePlaceholderNonceValid('a'.repeat(MIN_CACHE_PLACEHOLDER_NONCE_LENGTH + 10))).toBe(
      true,
    )
  })
})

describe('warnIfCachePlaceholderNonceMissing', () => {
  const errorSpy = installConsoleErrorSpy()

  it('warns when CACHE_PLACEHOLDER_NONCE is unset', async () => {
    const { warnIfCachePlaceholderNonceMissing } = await importEnvValidation()
    warnIfCachePlaceholderNonceMissing({})
    expect(errorSpy()).toHaveBeenCalledWith(expect.stringContaining('is not set or empty'))
  })

  it('warns when CACHE_PLACEHOLDER_NONCE is shorter than the minimum length', async () => {
    const { warnIfCachePlaceholderNonceMissing } = await importEnvValidation()
    warnIfCachePlaceholderNonceMissing({ CACHE_PLACEHOLDER_NONCE: 'too-short' })
    expect(errorSpy()).toHaveBeenCalledWith(expect.stringContaining('is too short'))
  })

  it('does not warn when CACHE_PLACEHOLDER_NONCE meets the minimum length', async () => {
    const { warnIfCachePlaceholderNonceMissing } = await importEnvValidation()
    warnIfCachePlaceholderNonceMissing({ CACHE_PLACEHOLDER_NONCE: 'a'.repeat(32) })
    expect(errorSpy()).not.toHaveBeenCalled()
  })
})
