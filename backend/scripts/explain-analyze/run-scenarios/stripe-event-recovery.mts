import { write } from '@data-stores/psql'
import { claimRecoverableStripeEvents } from '@services/stripe/recovery'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runStripeEventRecoveryScenario(): Promise<void> {
  const { rows: types } = await write<{ id: string }>(
    `/* seedExplainStripeRecovery:type */ INSERT INTO stripe_event_types (stripe_event_type)
     VALUES ('explain.recovery') ON CONFLICT (stripe_event_type)
     DO UPDATE SET stripe_event_type = EXCLUDED.stripe_event_type RETURNING id`,
  )
  await write(
    `/* seedExplainStripeRecovery:events */
     INSERT INTO stripe_events (stripe_event_id, stripe_event_type_id, occurred_at, payload)
     SELECT 'explain-recovery-' || n, $1::uuid, NOW() - INTERVAL '2 days', '{}'::jsonb
     FROM generate_series(0, 1999) AS n ON CONFLICT (stripe_event_id) DO NOTHING`,
    [types[0]!.id],
  )
  await write(
    `/* seedExplainStripeRecovery:work */
     INSERT INTO stripe_event_processing_work_items (stripe_event_id, available_at, dispatched_at)
     SELECT id, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'
     FROM stripe_events WHERE stripe_event_id LIKE 'explain-recovery-%'
     ON CONFLICT (stripe_event_id) DO NOTHING`,
  )
  await write(`/* seedExplainStripeRecovery:analyze */
    ANALYZE stripe_event_processing_work_items, stripe_events`)
  registerScenarioContract('membership-stripe-event-recovery', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['stripe_event_processing_work_items_pkey'] },
      { kind: 'maxProcessedRows', relation: 'stripe_event_processing_work_items', max: 3_100 },
    ],
    seededRows: { stripe_event_processing_work_items: 2000, stripe_events: 2000 },
  })
  await runAndCapture(
    'membership-stripe-event-recovery',
    () => claimRecoverableStripeEvents(),
    undefined,
    'claimRecoverableStripeEvents',
    {
      afterCapture: async () => {
        await write(`/* rearmExplainStripeRecovery */
          UPDATE stripe_event_processing_work_items work
          SET dispatched_at = NOW() - INTERVAL '1 day', leased_at = NULL,
            lease_expires_at = NULL, failed_at = NULL
          FROM stripe_events event WHERE event.id = work.stripe_event_id
            AND event.stripe_event_id LIKE 'explain-recovery-%'`)
      },
    },
  )
}
