import { paginationConfig, paginationMaxima, getPaginationLimit } from '@services/pagination/config'
import { dynamicConfigRegistry } from './registry.mts'
import { describe, expect, it } from 'vitest'
import { orderDynamicConfigRegistryEntries } from './registry-order.mts'

describe('dynamic config registry entry ordering', () => {
  it('registers the bounded active session limit', () => {
    expect(
      dynamicConfigRegistry.get('session-limits-config')?.fields.active_sessions_per_user,
    ).toMatchObject({ integer: true, minValue: 1, maxValue: 1_000 })
  })
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
    const defaults = paginationConfig.defaultFields
    const fields = Object.keys(defaults).toSorted() as (keyof typeof paginationMaxima)[]
    expect(paginationConfig.key).toBe('dynamic-config:pagination-config')
    expect(Object.keys(entry.fields).toSorted()).toEqual(fields)
    expect(Object.keys(paginationMaxima).toSorted()).toEqual(fields)
    for (const field of fields) {
      const defaultValue = defaults[field]
      expect(entry.fields[field]).toMatchObject({
        integer: true,
        minValue: 1,
        maxValue: paginationMaxima[field],
      })
      expect(typeof defaultValue).toBe('number')
      expect(getPaginationLimit(field)).toBe(defaultValue)
    }
  })

  it('rejects registry entries omitted from the registry order', () => {
    expect(() =>
      orderDynamicConfigRegistryEntries(
        [{ namespace: 'feature-flags' }, { namespace: 'new-config' }],
        ['feature-flags'],
      ),
    ).toThrow('Dynamic config registry entries missing from REGISTRY_ORDER: new-config')
  })
  it('orders original entry objects by the registry order', () => {
    const first = { namespace: 'first' }
    const second = { namespace: 'second' }
    const result = orderDynamicConfigRegistryEntries([first, second], ['second', 'first'])
    expect(result).toEqual([second, first])
    expect(result[0]).toBe(second)
    expect(result[1]).toBe(first)
  })

  it('rejects an order entry with no corresponding registry entry', () => {
    expect(() => orderDynamicConfigRegistryEntries([], ['missing'])).toThrow(
      'Missing dynamic config registry entry for missing',
    )
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
  it('registers the bounded OAuth friend connection page', () => {
    expect(dynamicConfigRegistry.get('oauth-account-friend-work-config')?.fields).toMatchObject({
      friend_reference_connect_batch_size: { integer: true, minValue: 1, maxValue: 1_000 },
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
  it('registers the referral link cleanup batch ceiling', () => {
    expect(dynamicConfigRegistry.get('referral-link-cleanup-work-config')?.fields).toMatchObject({
      batch_size: { integer: true, minValue: 1, maxValue: 5_000 },
    })
  })
  it('registers the friends per-provider budget', () => {
    expect(dynamicConfigRegistry.get('friends-dispatch-work-config')?.fields).toMatchObject({
      batch_size: { integer: true, minValue: 1 },
      max_rows_per_provider_per_run: { integer: true, minValue: 1 },
    })
  })
  it('registers the conversation participant hard maximum', () => {
    expect(
      dynamicConfigRegistry.get('conversation-participant-limits')?.fields
        .participants_per_conversation,
    ).toMatchObject({ integer: true, minValue: 1, maxValue: 50 })
  })
  it('registers the bounded SES reconciliation page budget', () => {
    expect(dynamicConfigRegistry.get('ses-inbound-work-config')?.fields).toMatchObject({
      reconcile_max_pages_per_run: { integer: true, minValue: 1, maxValue: 100 },
    })
  })
})
