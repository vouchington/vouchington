import { reconcilePostModerationWork } from '@services/post-clearance'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  DELETED_PARENT_MODERATION_POST_ID,
  deleteDeletedParentModerationVersion,
  seedDeletedParentModerationVersion,
} from './deleted-parent-page-seeds.mts'

export async function runModerationVersionPageScenarios(): Promise<void> {
  await seedDeletedParentModerationVersion()
  try {
    registerScenarioContract('deleted-parent-moderation-versions', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: [
            'idx_post_moderation_versions__post_id__id',
            'idx_post_moderation_versions__policy_revision__id',
          ],
          anyOf: true,
        },
        { kind: 'maxProcessedRows', relation: 'post_moderation_versions', max: 20 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 10 },
      ],
    })
    await runAndCapture(
      'deleted-parent-moderation-versions',
      () => reconcilePostModerationWork(10, [DELETED_PARENT_MODERATION_POST_ID]),
      undefined,
      'reconcilePostModerationWork',
    )
    registerScenarioContract('moderation-current-policy-page', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_post_moderation_versions__policy_revision__id'] },
        { kind: 'maxProcessedRows', relation: 'post_moderation_versions', max: 20 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 20 },
      ],
      crossPartition: {
        posts: 'Current moderation versions reference exact post ids across retained ranges.',
      },
    })
    await runAndCapture(
      'moderation-current-policy-page',
      () => reconcilePostModerationWork(10),
      undefined,
      'reconcilePostModerationWork',
    )
  } finally {
    await deleteDeletedParentModerationVersion()
  }
}
