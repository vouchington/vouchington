import type { Job } from 'glide-mq'
import { agentCallOperationKey } from '@agents/_shared'
import { getAgentCallReceipt } from '@services/ai-usage/agent-call-receipts'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { getStoryPostSpendState } from './process-story-post.mts'

// DB predicates run only after the cheap static filter and an active breach, so spend-free
// story-post retries do not pay a round trip on every dispatch.
export async function jobWouldIncurSpend(job: Job<AIAgentJobData>): Promise<boolean> {
  if (job.name === 'story-post') {
    const data = job.data as import('@queues/ai-agents/types').StoryPostJobData
    const state = await getStoryPostSpendState(data.post_id, data.force ?? false)
    if (!state?.wouldCallModel) return false
    // The processor resolves a slug to this same post.id before choosing the paid-call receipt.
    const operationId = data.force ? `${state.postId}:${job.id}` : state.postId
    return !(await getAgentCallReceipt(agentCallOperationKey('story-post', operationId)))
  }
  const receiptIdentity = existingReceiptIdentity(job)
  if (receiptIdentity) {
    const [agentSlug, operationId] = receiptIdentity
    // A completed receipt only replays local writes. An uncertain one must reach the processor
    // too, so it can stop permanently for review instead of being parked by the spend gate.
    if (await getAgentCallReceipt(agentCallOperationKey(agentSlug, operationId))) return false
  }
  return true
}

function existingReceiptIdentity(job: Job<AIAgentJobData>): [string, string] | null {
  if (job.name === 'report-judgement') {
    const data = job.data as import('@queues/ai-agents/types').ReportJudgementJobData
    return [
      'report-judgement',
      data.rerun_by_id
        ? job.id
        : `${data.entity_type}:${data.entity_id}:${data.triggering_report_id}`,
    ]
  }
  if (job.name === 'copyright-appeal-recommendation') {
    const data = job.data as import('@queues/ai-agents/types').CopyrightAppealRecommendationJobData
    return ['copyright-appeal-recommendation', data.submission_id]
  }
  if (job.name === 'copyright-submission-guidance') {
    const data = job.data as import('@queues/ai-agents/types').CopyrightSubmissionGuidanceJobData
    return ['copyright-submission-guidance', data.submission_id]
  }
  return null
}
