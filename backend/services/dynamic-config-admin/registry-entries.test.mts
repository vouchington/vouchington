import { describe, expect, it } from 'vitest'
import { assertRegistryOrderIncludesEntries } from './registry-entries.mts'

describe('dynamic config registry entry ordering', () => {
  it('rejects registry entries omitted from the registry order', () => {
    expect(() =>
      assertRegistryOrderIncludesEntries(
        [{ namespace: 'feature-flags' }, { namespace: 'new-config' }],
        ['feature-flags'],
      ),
    ).toThrow('Dynamic config registry entries missing from REGISTRY_ORDER: new-config')
  })
})
