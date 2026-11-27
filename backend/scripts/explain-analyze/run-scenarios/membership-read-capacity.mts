import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { getOutstandingMembershipGrantIds } from '@services/memberships/grants/outstanding'
import {
  getActiveMembershipCatalogFromPrimary,
  type MembershipCatalogProduct,
} from '@services/memberships/provider-catalog'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  deleteMembershipCatalogReadCapacityMappings,
  seedMembershipCatalogReadCapacity,
  seedOutstandingMembershipGrantCapacity,
} from '../seed-data/membership-read-capacity.mts'

export async function runMembershipReadCapacityScenarios(): Promise<void> {
  const grants = await seedOutstandingMembershipGrantCapacity()
  registerScenarioContract('membership-outstanding-grants-at-cap', {
    seededRows: { membership_grants: 103, membership_source_states: 11_114 },
    expectations: [
      { kind: 'queryBinds', token: 'LIMIT' },
      { kind: 'maxProcessedRows', relation: 'membership_grants', max: 103 },
      // The full main-4 corpus shows this custom scan. Tighten after #6557.
      { kind: 'maxProcessedRows', relation: 'membership_source_states', max: 11_114 },
      { kind: 'maxInputRows', nodeType: 'Sort', max: 100 },
    ],
  })
  await runAndCapture(
    'membership-outstanding-grants-at-cap',
    async () => {
      await using query = await beginTransaction()
      assert.deepEqual(await getOutstandingMembershipGrantIds(grants.userId, query), grants.ids)
    },
    undefined,
    'getOutstandingMembershipGrantIds',
    { exactCapturedNames: ['getOutstandingMembershipGrantIds'] },
  )

  const catalog = await seedMembershipCatalogReadCapacity()
  try {
    registerScenarioContract('membership-active-catalog-near-cap', {
      seededRows: {
        membership_provider_products: 3_136,
        membership_products: 4,
        membership_provider_contexts: 12,
      },
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        // Main scans retired and other-context mappings. Tighten after #6558.
        { kind: 'maxProcessedRows', relation: 'membership_provider_products', max: 3_140 },
        { kind: 'maxInputRows', nodeType: 'Sort', max: 788 },
      ],
    })
    await runAndCapture(
      'membership-active-catalog-near-cap',
      async () => {
        const products = await getActiveMembershipCatalogFromPrimary()
        assert.deepEqual(
          sortProviderReferences(
            products.map(product => ({
              ...product,
              providers: product.providers.filter(reference =>
                reference.product_id.startsWith(catalog.prefix),
              ),
            })),
          ),
          sortProviderReferences(catalog.products),
        )
      },
      undefined,
      'getActiveMembershipCatalogFromPrimary',
      { exactCapturedNames: ['getActiveMembershipCatalogFromPrimary'] },
    )
  } finally {
    await deleteMembershipCatalogReadCapacityMappings(catalog.prefix)
  }
}

function sortProviderReferences(products: MembershipCatalogProduct[]): MembershipCatalogProduct[] {
  return products.map(product => ({
    ...product,
    providers: product.providers.toSorted((left, right) =>
      left.product_id.localeCompare(right.product_id),
    ),
  }))
}
