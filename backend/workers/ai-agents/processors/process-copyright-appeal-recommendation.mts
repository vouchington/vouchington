import type { Job } from 'glide-mq'
import type { CopyrightAppealRecommendationJobData } from '@queues/ai-agents/types'
import { runCopyrightAppealRecommendationAgent } from '@agents/copyright-appeal-recommendation'
import { loadServiceModelSelection } from '@services/ai-usage'

/** The agent persists advice only; moderator action is deliberately outside this processor. */
export async function processCopyrightAppealRecommendation(
  job: Job<CopyrightAppealRecommendationJobData>,
): Promise<{ success: true }> {
  await runCopyrightAppealRecommendationAgent(
    job.data.submission_id,
    await loadServiceModelSelection('copyright-appeal-recommendation'),
  )
  return { success: true }
}
