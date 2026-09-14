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

describe('warnIfProductionValueInvalid', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("warns for ambiguous value '1'", async () => {
    const { warnIfProductionValueInvalid } = await importEnvValidation()
    warnIfProductionValueInvalid({ PRODUCTION: '1' })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("PRODUCTION is set to '1'"))
  })

  it("warns for ambiguous value 'yes'", async () => {
    const { warnIfProductionValueInvalid } = await importEnvValidation()
    warnIfProductionValueInvalid({ PRODUCTION: 'yes' })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("PRODUCTION is set to 'yes'"))
  })

  it("warns for ambiguous value 'on'", async () => {
    const { warnIfProductionValueInvalid } = await importEnvValidation()
    warnIfProductionValueInvalid({ PRODUCTION: 'on' })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("PRODUCTION is set to 'on'"))
  })

  it("does not warn for 'true'", async () => {
    const { warnIfProductionValueInvalid } = await importEnvValidation()
    warnIfProductionValueInvalid({ PRODUCTION: 'true' })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("does not warn for 'false'", async () => {
    const { warnIfProductionValueInvalid } = await importEnvValidation()
    warnIfProductionValueInvalid({ PRODUCTION: 'false' })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not warn when PRODUCTION is not set', async () => {
    const { warnIfProductionValueInvalid } = await importEnvValidation()
    warnIfProductionValueInvalid({})
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('deduplicates warnings — fires at most once per module instance', async () => {
    const { warnIfProductionValueInvalid } = await importEnvValidation()
    warnIfProductionValueInvalid({ PRODUCTION: '1' })
    warnIfProductionValueInvalid({ PRODUCTION: '1' })
    warnIfProductionValueInvalid({ PRODUCTION: 'yes' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
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
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns when CSP_ASSET_ORIGIN is set to a non-https URL', async () => {
    const { warnIfCspAssetOriginInvalid } = await importEnvValidation()
    warnIfCspAssetOriginInvalid({ CSP_ASSET_ORIGIN: 'http://cdn.example.com' })
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CSP_ASSET_ORIGIN failed validation'),
    )
  })

  it('warns when CSP_ASSET_ORIGIN is set to a malformed URL', async () => {
    const { warnIfCspAssetOriginInvalid } = await importEnvValidation()
    warnIfCspAssetOriginInvalid({ CSP_ASSET_ORIGIN: 'not-a-url' })
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CSP_ASSET_ORIGIN failed validation'),
    )
  })

  it('does not warn when CSP_ASSET_ORIGIN is a valid https URL', async () => {
    const { warnIfCspAssetOriginInvalid } = await importEnvValidation()
    warnIfCspAssetOriginInvalid({ CSP_ASSET_ORIGIN: 'https://d1234567.cloudfront.net' })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not warn when CSP_ASSET_ORIGIN is not set', async () => {
    const { warnIfCspAssetOriginInvalid } = await importEnvValidation()
    warnIfCspAssetOriginInvalid({})
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not warn when CSP_ASSET_ORIGIN is empty string', async () => {
    const { warnIfCspAssetOriginInvalid } = await importEnvValidation()
    warnIfCspAssetOriginInvalid({ CSP_ASSET_ORIGIN: '' })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not warn when CSP_ASSET_ORIGIN is whitespace-only', async () => {
    const { warnIfCspAssetOriginInvalid } = await importEnvValidation()
    warnIfCspAssetOriginInvalid({ CSP_ASSET_ORIGIN: '  ' })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('deduplicates warnings — fires at most once per module instance', async () => {
    const { warnIfCspAssetOriginInvalid } = await importEnvValidation()
    warnIfCspAssetOriginInvalid({ CSP_ASSET_ORIGIN: 'not-a-url' })
    warnIfCspAssetOriginInvalid({ CSP_ASSET_ORIGIN: 'http://cdn.example.com' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
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
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns when CACHE_PLACEHOLDER_NONCE is unset', async () => {
    const { warnIfCachePlaceholderNonceMissing } = await importEnvValidation()
    warnIfCachePlaceholderNonceMissing({})
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('is not set or empty'))
  })

  it('warns when CACHE_PLACEHOLDER_NONCE is shorter than the minimum length', async () => {
    const { warnIfCachePlaceholderNonceMissing } = await importEnvValidation()
    warnIfCachePlaceholderNonceMissing({ CACHE_PLACEHOLDER_NONCE: 'too-short' })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('is too short'))
  })

  it('does not warn when CACHE_PLACEHOLDER_NONCE meets the minimum length', async () => {
    const { warnIfCachePlaceholderNonceMissing } = await importEnvValidation()
    warnIfCachePlaceholderNonceMissing({ CACHE_PLACEHOLDER_NONCE: 'a'.repeat(32) })
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
