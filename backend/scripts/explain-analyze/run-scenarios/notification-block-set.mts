import { getUserIdsBlockedOrMutedEitherWay } from '@services/entity-relations/check-block-mute'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

/** Test indexed set filtering across block, mute, and both relationship directions. */
export async function runNotificationBlockSet(): Promise<void> {
  registerScenarioContract('notification-block-set', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__user__block__user', max: 100 },
      { kind: 'maxProcessedRows', relation: 'relation__user__mute__user', max: 100 },
    ],
  })
  await runAndCapture(
    'notification-block-set',
    async () => {
      for (const [sender, target] of [
        [0, 5000],
        [5000, 0],
        [2500, 7500],
        [7500, 2500],
      ]) {
        const recipients = [
          seedUuid(target, '01'),
          ...Array.from({ length: 11 }, (_, i) => seedUuid(10_000 + i, '01')),
        ]
        const blocked = await getUserIdsBlockedOrMutedEitherWay(seedUuid(sender, '01'), recipients)
        if (blocked.size !== 1 || !blocked.has(seedUuid(target, '01'))) {
          throw new Error('Seeded block/mute pair must be the only filtered recipient')
        }
      }
    },
    undefined,
    'getUserIdsBlockedOrMutedEitherWay',
  )
}
