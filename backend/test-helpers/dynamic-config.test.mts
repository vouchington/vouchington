import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createDynamicConfigTestBaseline,
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  resetDynamicConfigToTestBaseline,
  snapshotDynamicConfigFieldsForTest,
  type TestDynamicConfig,
} from './dynamic-config.mts'

type BaselineCase = {
  key: string
  defaults: Record<string, boolean | number | string>
  expected: Record<string, boolean | number | string>
}

const baselineCases: BaselineCase[] = [
  {
    key: 'rate-limit-thresholds',
    defaults: { read_tier0: 1, write_tier5: 2, ttl: 60 },
    expected: { read_tier0: 99_999, write_tier5: 99_999, ttl: 60 },
  },
  {
    key: 'contribution-rate-limits',
    defaults: { post_limit: 1, reply_limit: 2, window_seconds: 60 },
    expected: { post_limit: 99_999, reply_limit: 99_999, window_seconds: 60 },
  },
  {
    key: 'bloom-filter-config',
    defaults: { bookmarkBloomFilterEnabled: true, apiKeyBloomFilterEnabled: true, size: 8 },
    expected: { bookmarkBloomFilterEnabled: false, apiKeyBloomFilterEnabled: false, size: 8 },
  },
  {
    key: 'web-risk-config',
    defaults: { enabled: true, timeout: 500 },
    expected: { enabled: false, timeout: 500 },
  },
  {
    key: 'ordinary-config',
    defaults: { enabled: true, limit: 3 },
    expected: { enabled: true, limit: 3 },
  },
]

describe('DynamicConfig test isolation helpers', () => {
  it('applies the shared test baseline without production-default regressions', () => {
    const routeConfig = makeConfig('route-rate-limit-config', {
      enabled: true,
      anon_read: 180,
      anon_write: 15,
      anon_sensitive: 5,
      anon_oauth_callback: 300,
      anon_read_ttl: 60,
    })

    expect(createDynamicConfigTestBaseline(routeConfig)).toEqual({
      enabled: false,
      anon_read: 99_999,
      anon_write: 99_999,
      anon_sensitive: 99_999,
      anon_oauth_callback: 99_999,
      anon_read_ttl: 60,
    })

    routeConfig.fields.set('enabled', true)
    routeConfig.fields.set('anon_write', 2)
    resetDynamicConfigToTestBaseline(routeConfig)
    expect(Object.fromEntries(routeConfig.fields)).toEqual(
      createDynamicConfigTestBaseline(routeConfig),
    )
  })

  it.each(baselineCases)(
    'creates the centralized baseline for $key',
    ({ key, defaults, expected }) => {
      expect(createDynamicConfigTestBaseline(makeConfig(key, defaults))).toEqual(expected)
    },
  )

  it('validates every override before mutating local fields', () => {
    const config = makeConfig('example', { enabled: false, limit: 5, label: 'original' })
    const original = [...config.fields]

    expect(() => overrideDynamicConfigFieldsForTest(config, { enabled: true, missing: 1 })).toThrow(
      'Unknown DynamicConfig test field: missing',
    )
    expect(config.fields).toEqual(new Map(original))

    expect(() =>
      overrideDynamicConfigFieldsForTest(config, { limit: Number.POSITIVE_INFINITY }),
    ).toThrow('must be a finite number')
    expect(config.fields).toEqual(new Map(original))

    expect(() => overrideDynamicConfigFieldsForTest(config, { label: 1 })).toThrow('must be string')
    expect(config.fields).toEqual(new Map(original))
  })

  it('restores the exact overridden-field snapshot idempotently', () => {
    const config = makeConfig('example', { enabled: false, limit: 5, label: 'original' })
    config.fields.delete('label')
    const snapshot = new Map(config.fields)
    const restore = overrideDynamicConfigFieldsForTest(config, {
      enabled: true,
      limit: 8,
      label: 'temporary',
    })

    expect(Object.fromEntries(config.fields)).toEqual({
      enabled: true,
      limit: 8,
      label: 'temporary',
    })
    restore()
    restore()
    expect(config.fields).toEqual(snapshot)
  })

  it('preserves unrelated changes while restoring only overridden fields', () => {
    const config = makeConfig('example', { enabled: false, limit: 5, label: 'original' })
    const restoreEnabled = overrideDynamicConfigFieldsForTest(config, { enabled: true })
    const restoreLimit = overrideDynamicConfigFieldsForTest(config, { limit: 10 })

    config.fields.set('label', 'changed independently')
    restoreEnabled()
    expect(Object.fromEntries(config.fields)).toEqual({
      enabled: false,
      limit: 10,
      label: 'changed independently',
    })
    restoreLimit()
    expect(Object.fromEntries(config.fields)).toEqual({
      enabled: false,
      limit: 5,
      label: 'changed independently',
    })
  })

  it('supports nested overrides restored in LIFO order', () => {
    const config = makeConfig('example', { enabled: false, limit: 5 })
    const restoreOuter = overrideDynamicConfigFieldsForTest(config, { limit: 10 })
    const restoreInner = overrideDynamicConfigFieldsForTest(config, { limit: 20 })

    expect(config.fields.get('limit')).toBe(20)
    restoreInner()
    expect(config.fields.get('limit')).toBe(10)
    restoreOuter()
    expect(config.fields.get('limit')).toBe(5)
  })

  it('snapshots multiple configs and supports validated local deletion', () => {
    const first = makeConfig('first', { enabled: false, limit: 5 })
    const second = makeConfig('second', { label: 'original' })
    const restoreAll = snapshotDynamicConfigFieldsForTest([first, second])

    overrideDynamicConfigFieldsForTest(first, { enabled: true })
    deleteDynamicConfigFieldsForTest(first, ['limit'])
    overrideDynamicConfigFieldsForTest(second, { label: 'temporary' })
    expect(() => deleteDynamicConfigFieldsForTest(first, ['missing'])).toThrow(
      'Unknown DynamicConfig test field: missing',
    )

    restoreAll()
    expect(Object.fromEntries(first.fields)).toEqual({ enabled: false, limit: 5 })
    expect(Object.fromEntries(second.fields)).toEqual({ label: 'original' })
  })
})

describe('DynamicConfig suite lifecycle isolation fixture', () => {
  const config = makeConfig('suite-lifecycle', { enabled: false, limit: 5, label: 'baseline' })
  let restoreTestSnapshot: (() => void) | undefined

  beforeEach(() => {
    restoreTestSnapshot = snapshotDynamicConfigFieldsForTest([config])
  })

  afterEach(() => {
    restoreTestSnapshot?.()
    restoreTestSnapshot = undefined
  })

  describe('suite-level override', () => {
    let restoreSuiteOverride: (() => void) | undefined

    beforeAll(() => {
      restoreSuiteOverride = overrideDynamicConfigFieldsForTest(config, {
        enabled: true,
        label: 'suite',
      })
    })

    afterAll(() => {
      restoreSuiteOverride?.()
      restoreSuiteOverride = undefined
    })

    it('keeps beforeAll overrides visible inside the first test', () => {
      expect(Object.fromEntries(config.fields)).toEqual({
        enabled: true,
        limit: 5,
        label: 'suite',
      })

      overrideDynamicConfigFieldsForTest(config, { label: 'test-only' })
    })

    it('restores per-test mutations without removing beforeAll overrides', () => {
      expect(Object.fromEntries(config.fields)).toEqual({
        enabled: true,
        limit: 5,
        label: 'suite',
      })
    })
  })

  describe('next suite', () => {
    it('does not observe the previous suite override after afterAll cleanup', () => {
      expect(Object.fromEntries(config.fields)).toEqual({
        enabled: false,
        limit: 5,
        label: 'baseline',
      })
    })
  })
})

function makeConfig(
  key: string,
  defaults: Record<string, boolean | number | string>,
): TestDynamicConfig {
  return {
    key: `dynamic-config:${key}`,
    fields: new Map(Object.entries(defaults)),
    fieldTypes: Object.fromEntries(
      Object.entries(defaults).map(([name, value]) => [name, typeof value]),
    ) as TestDynamicConfig['fieldTypes'],
    defaultFields: defaults,
  }
}
