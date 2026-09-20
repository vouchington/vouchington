import type { Job } from 'glide-mq'
import type { CopyrightEmailIntakeJobData } from '@queues/ai-agents/types'
import {
  runCopyrightEmailIntakeAgent,
  type CopyrightEmailIntakeModelCaller,
} from '@agents/copyright-email-intake'

export async function processCopyrightEmailIntake(
  job: Job<CopyrightEmailIntakeJobData>,
  callModel?: CopyrightEmailIntakeModelCaller,
): Promise<{ success: true }> {
  await runCopyrightEmailIntakeAgent(job.data.intake_id, callModel)
  return { success: true }
}
