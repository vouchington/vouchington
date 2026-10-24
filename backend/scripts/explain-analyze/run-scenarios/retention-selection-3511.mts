import { write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runRetentionSelection3511Scenario(): Promise<void> {
  registerScenarioContract('notification-push-intent-terminal-retention', {
    seededRows: { notification_push_intents: 2000 },
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_notification_push_intents__terminal_retention'] },
      { kind: 'maxProcessedRows', relation: 'notification_push_intents', max: 100 },
    ],
  })
  await runAndCapture('notification-push-intent-terminal-retention', () =>
    write(
      `/* deleteTerminalNotificationPushIntentBatch: candidate page */
      SELECT user_id, notification_id FROM notification_push_intents
      WHERE status IN ('delivered', 'suppressed')
        AND COALESCE(delivered_at, suppressed_at) < $1::timestamptz
      ORDER BY COALESCE(delivered_at, suppressed_at), user_id, notification_id
      LIMIT $2 FOR UPDATE SKIP LOCKED`,
      [new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), 10],
    ),
  )
}
