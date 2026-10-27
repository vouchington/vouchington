import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  MODERATION_SIGNALS_BAN_EVASION_JOB,
  MODERATION_SIGNALS_SPAM_DETECTION_JOB,
} from '@queues/background/enqueues/moderation-signals-jobs'
import { detectBanEvasionForMember } from '@services/communities/ban-evasion'
import { processSpamDetection } from './processors.mts'

export const moderationSignalsHandlers = [
  backgroundHandler(MODERATION_SIGNALS_SPAM_DETECTION_JOB, async job => {
    if (!job.data.versionId) throw new Error('Spam detection job requires versionId in job.data')
    const applied = await processSpamDetection(job.data.versionId)
    return { success: true, applied }
  }),
  backgroundHandler(MODERATION_SIGNALS_BAN_EVASION_JOB, async job => {
    if (!job.data.communityId || !job.data.userId) {
      throw new Error('Ban evasion job requires communityId and userId in job.data')
    }
    await detectBanEvasionForMember(job.data.communityId, job.data.userId, job.data.postId)
    return { success: true }
  }),
]
