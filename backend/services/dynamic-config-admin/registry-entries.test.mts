import {
  paginationConfig,
  paginationDefaults,
  paginationMaxima,
  getPaginationLimit,
} from '@services/pagination/config'
import { dynamicConfigRegistry } from './registry.mts'
import { describe, expect, it } from 'vitest'
import { assertRegistryOrderIncludesEntries } from './registry-entries.mts'

describe('dynamic config registry entry ordering', () => {
  it('registers the bounded bot challenge clearance window', () => {
    expect(
      dynamicConfigRegistry.get('bot-challenge-config')?.fields.clearance_seconds,
    ).toMatchObject({
      integer: true,
      minValue: 0,
      maxValue: 3600,
    })
  })
  it('registers every field with its static hard ceiling and integer metadata', () => {
    const entry = dynamicConfigRegistry.get('pagination-config')!
    expect(paginationConfig.key).toBe('dynamic-config:pagination-config')
    expect(Object.keys(entry.fields).toSorted()).toEqual(Object.keys(paginationDefaults).toSorted())
    expect(Object.keys(paginationMaxima).toSorted()).toEqual(
      Object.keys(paginationDefaults).toSorted(),
    )
    for (const field of Object.keys(paginationDefaults) as (keyof typeof paginationDefaults)[]) {
      expect(entry.fields[field]).toMatchObject({
        integer: true,
        minValue: 1,
        maxValue: paginationMaxima[field],
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
    expect(dynamicConfigRegistry.get(namespace)?.fields).toMatchObject({
      batch_size: { integer: true, minValue: 1 },
      max_batches_per_run: { integer: true, minValue: 1 },
    })
  })
  it.each([
    'crawl-dispatch-work-config',
    'referral-crawl-dispatch-work-config',
    'referral-unfurl-dispatch-work-config',
    'entity-reconciliation-work-config',
  ])('registers finite cursor work bounds for %s', namespace => {
    expect(dynamicConfigRegistry.get(namespace)?.fields).toMatchObject({
      batch_size: { integer: true, minValue: 1 },
      max_rows_per_run: { integer: true, minValue: 1 },
    })
  })
  it('registers the friends per-provider budget', () => {
    expect(dynamicConfigRegistry.get('friends-dispatch-work-config')?.fields).toMatchObject({
      batch_size: { integer: true, minValue: 1 },
      max_rows_per_provider_per_run: { integer: true, minValue: 1 },
    })
  })
  it('registers the bounded SES reconciliation page budget', () => {
    expect(dynamicConfigRegistry.get('ses-inbound-work-config')?.fields).toMatchObject({
      reconcile_max_pages_per_run: { integer: true, minValue: 1, maxValue: 100 },
    })
  })
})
