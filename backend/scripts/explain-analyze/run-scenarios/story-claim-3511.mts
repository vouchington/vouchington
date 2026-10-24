import { claimStoryPostRelatedUrlProjectionWork } from '@services/stories/story-post-related-url-projection-work'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runStoryClaim3511Scenario(): Promise<void> {
  registerScenarioContract('story-projection-due-claim', {
    seededRows: { story_post_related_url_projection_jobs: 10000 },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_story_post_relate_url_project_jobs__last_claimed_at_post_id'],
      },
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_jobs', max: 300 },
    ],
  })
  await runAndCapture(
    'story-projection-due-claim',
    async () => {
      const work = await claimStoryPostRelatedUrlProjectionWork()
      if (!work) throw new Error('Expected an available story projection job')
    },
    undefined,
    'claimStoryPostRelatedUrlProjection',
  )
}
