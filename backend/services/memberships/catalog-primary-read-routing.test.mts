import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
}

describe('membership purchase catalog primary reads', () => {
  it('keeps ordinary catalog reads replica-eligible and routes purchase reads to the primary', () => {
    const catalogSource = source('./get-catalog.mts')
    expect(catalogSource).toContain('fetchSkusForActivePlans(context)')
    expect(catalogSource).toContain('const { rows } = await read(')
    expect(source('./stripe-catalog.mts')).toContain('const { rows } = await write(')
  })

  it('uses only primary catalog reads for plans and purchase intents', () => {
    expect(source('../../api/v1/memberships/plans.mts')).toContain(
      'await getActiveMembershipCatalogFromPrimary()',
    )
    const purchaseIntentSource = source('./purchase-intents.mts')
    expect(purchaseIntentSource).toContain('await using query = await beginTransaction()')
    expect(purchaseIntentSource).toContain(
      'await query<PurchaseIntentRow>(sql`/* createMembershipPurchaseIntent.insert */',
    )
  })
})
