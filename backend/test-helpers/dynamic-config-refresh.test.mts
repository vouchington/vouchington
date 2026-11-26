import { describe, expect, it } from 'vitest'
import {
  closeScopedDynamicConfigContext,
  createDynamicConfigForTest,
  createDynamicConfigTestKey,
  overrideDynamicConfigFieldsForTest,
} from './dynamic-config.mts'

describe('DynamicConfig test overrides across refresh()', () => {
  it('keeps an override through a real refresh until it is disposed', async () => {
    const config = createDynamicConfigForTest({
      key: createDynamicConfigTestKey('override-refresh'),
      fieldTypes: { limit: 'number', label: 'string' },
      defaultFields: { limit: 5, label: 'default' },
      staleTtlSeconds: 1,
    })
    try {
      await config.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(config, { limit: 8 })

      config.staleTtl = 0
      await config.refresh()
      expect(config.fields.get('limit')).toBe(8)
      expect(config.fields.get('label')).toBe('default')

      restore()
      expect(config.fields.get('limit')).toBe(5)
      await config.refresh()
      expect(config.fields.get('limit')).toBe(5)
    } finally {
      await closeScopedDynamicConfigContext([config])
    }
  })
})
