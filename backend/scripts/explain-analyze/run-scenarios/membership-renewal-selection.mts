import { write } from '@data-stores/psql'
import {
  createObservedRenewingMembership,
  createPlusSku,
} from '@voucha/test-helpers/renewal-notification-fixtures'
import { getUsersApproachingRenewalWithPriceIncrease } from '@services/memberships/renewal-check'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runMembershipRenewalSelectionScenario(): Promise<void> {
  const providerApplicationId = 'explain-renewal-selection'
  const currentSku = await createPlusSku(500, { provider_application_id: providerApplicationId })
  const renewalSku = await createPlusSku(800, { provider_application_id: providerApplicationId })
  const renewalAt = new Date(Date.now() + 15 * 86_400_000)
  for (let index = 0; index < 20; index++) {
    // Each fixture has its own user and direct provider source.
    // no-mistakes-disable-next-line query-reached-per-item: 20 fixed FK-valid provider fixtures are sequential on one test database.
    await createObservedRenewingMembership(
      seedUuid(15_000 + index, '01'),
      currentSku,
      renewalSku,
      providerApplicationId,
      renewalAt,
    )
  }
  await write(`/* seedExplainRenewalSelection:analyze */
    ANALYZE memberships, membership_source_states, membership_provider_observations,
      membership_provider_evidence_records, membership_products,
      membership_renewal_price_increase_notification_work_items`)
  registerScenarioContract('membership-renewal-selection', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_memberships__live_source', 'idx_memberships__source_id'],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'memberships', max: 25 },
    ],
    seededRows: { memberships: 320, membership_provider_observations: 20 },
  })
  await runAndCapture(
    'membership-renewal-selection',
    () => getUsersApproachingRenewalWithPriceIncrease(undefined, 25),
    undefined,
    'getUsersApproachingRenewalWithPriceIncrease',
  )
}
