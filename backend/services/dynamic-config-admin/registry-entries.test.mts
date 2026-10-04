import {
  paginationConfig,
  paginationDefaults,
  paginationMaxima,
  getPaginationLimit,
} from '@services/pagination/config'
import { getDynamicConfigRegistryEntry } from './registry.mts'
import { describe, expect, it } from 'vitest'
import { assertRegistryOrderIncludesEntries } from './registry-entries.mts'

describe('dynamic config registry entry ordering', () => {
  it('registers every field with its static hard ceiling and integer metadata', () => {
    const entry = getDynamicConfigRegistryEntry('pagination-config')!
    expect(paginationConfig.key).toBe('dynamic-config:pagination-config')
    expect(Object.keys(entry.fields).toSorted()).toEqual(Object.keys(paginationDefaults).toSorted())
    expect(Object.keys(paginationMaxima).toSorted()).toEqual(
      Object.keys(paginationDefaults).toSorted(),
    )
    for (const field of Object.keys(paginationDefaults) as (keyof typeof paginationDefaults)[]) {
      expect(entry.fields[field]).toMatchObject({
        integer: true,
        min_value: 1,
        max_value: paginationMaxima[field],
      })
      expect(getPaginationLimit(field)).toBe(paginationDefaults[field])
    }
  })

  it('rejects registry entries omitted from the registry order', () => {
    expect(() =>
      assertRegistryOrderIncludesEntries(
        [{ namespace: 'feature-flags' }, { namespace: 'new-config' }],
        ['feature-flags'],
      ),
    ).toThrow('Dynamic config registry entries missing from REGISTRY_ORDER: new-config')
  })
  it.each([
    'api-keys-work-config',
    'account-data-requests-work-config',
    'memberships-work-config',
    'copyright-notices-work-config',
  ])('registers finite runtime work bounds for %s', namespace => {
    expect(getDynamicConfigRegistryEntry(namespace)?.fields).toMatchObject({
      batch_size: { integer: true, min_value: 1 },
      max_batches_per_run: { integer: true, min_value: 1 },
    })
  })
  it.each([
    'crawl-dispatch-work-config',
    'referral-crawl-dispatch-work-config',
    'referral-unfurl-dispatch-work-config',
    'entity-reconciliation-work-config',
  ])('registers finite cursor work bounds for %s', namespace => {
    expect(getDynamicConfigRegistryEntry(namespace)?.fields).toMatchObject({
      batch_size: { integer: true, min_value: 1 },
      max_rows_per_run: { integer: true, min_value: 1 },
    })
  })
  it('registers the friends per-provider budget', () => {
    expect(getDynamicConfigRegistryEntry('friends-dispatch-work-config')?.fields).toMatchObject({
      batch_size: { integer: true, min_value: 1 },
      max_rows_per_provider_per_run: { integer: true, min_value: 1 },
    })
  })
})
