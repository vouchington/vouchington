import { describe, expect, it } from 'vitest'
// oxlint-disable-next-line no-restricted-imports -- The hook targets the raw valkyries class.
import { DynamicConfig as RawDynamicConfig } from 'valkyries/dynamic-config'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'

const DEFAULT_LIMIT = 5
const OVERRIDE_LIMIT = 8
const VALKEY_LIMIT = 9

/** A real valkyries `refresh()` without a connection: only `getFieldsMap` is stubbed. */
function createRefreshableConfig(): RawDynamicConfig {
  const config = Object.create(RawDynamicConfig.prototype) as RawDynamicConfig
  Object.assign(config, {
    key: 'dynamic-config:refresh-hook',
    fieldTypes: { limit: 'number' },
    defaultFields: { limit: DEFAULT_LIMIT },
    fieldsConfig: [{ name: 'limit', type: 'number', defaultValue: DEFAULT_LIMIT }],
    fields: new Map<string, boolean | number | string>([['limit', DEFAULT_LIMIT]]),
    staleTtl: 0,
    closed: false,
    isRefreshing: false,
    lastRefresh: 0,
    refreshUpdatedFields: null,
    getFieldsMap: () => Promise.resolve({ limit: { value: String(VALKEY_LIMIT) } }),
  })
  return config
}

describe('DynamicConfig test overrides across refresh()', () => {
  it('keeps an override through the real refresh() until it is disposed', async () => {
    const config = createRefreshableConfig()
    const restore = overrideDynamicConfigFieldsForTest(config, { limit: OVERRIDE_LIMIT })

    await config.refresh()
    expect(config.fields.get('limit')).toBe(OVERRIDE_LIMIT)

    restore()
    await config.refresh()
    expect(config.fields.get('limit')).toBe(VALKEY_LIMIT)
  })

  it('refreshes from Valkey when nothing is overridden', async () => {
    const config = createRefreshableConfig()

    await config.refresh()
    expect(config.fields.get('limit')).toBe(VALKEY_LIMIT)
  })

  it('fails with a clear cause when refresh() has no applyFieldsFromMap to hook', () => {
    const config = createRefreshableConfig()
    Object.setPrototypeOf(config, { refresh: () => Promise.resolve() })

    expect(() => overrideDynamicConfigFieldsForTest(config, { limit: OVERRIDE_LIMIT })).toThrow(
      'applyFieldsFromMap',
    )
  })
})
