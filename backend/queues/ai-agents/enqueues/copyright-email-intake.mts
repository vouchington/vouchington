import type { JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { CopyrightEmailIntakeJobData } from '../types.mts'

const jobIdFor = (intakeId: string) => `copyright_email_intake_${intakeId}`

function buildCopyrightEmailIntakeJob(intakeId: string): {
  data: CopyrightEmailIntakeJobData
  opts: JobOptions
} {
  return {
    data: { intake_id: intakeId },
    opts: {
      jobId: jobIdFor(intakeId),
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['copyright-email-intake'],
      deduplication: { id: `copyright_email_intake_${intakeId}`, mode: 'simple' },
      ordering: { key: `copyright_email_intake_${intakeId}`, concurrency: 1 },
    } satisfies JobOptions,
  }
}

type RecoveryDependencies = {
  getJob(
    id: string,
    options: { excludeData: true },
  ): Promise<{
    name: string
    getState(): Promise<string>
    retry(): Promise<void>
    remove(): Promise<void>
  } | null>
  enqueue: typeof enqueueCopyrightEmailIntakeAndWait
}

export async function enqueueOrRetryCopyrightEmailIntake(
  intakeId: string,
  dependencies: RecoveryDependencies = {
    getJob: (...args) => ai_agents.getJob(...args),
    enqueue: enqueueCopyrightEmailIntakeAndWait,
  },
): Promise<void> {
  const retained = await dependencies.getJob(jobIdFor(intakeId), { excludeData: true })
  if (retained) {
    if (retained.name !== 'copyright-email-intake') return
    const state = await retained.getState()
    if (state === 'failed') {
      await retained.retry()
      return
    }
    if (state === 'completed') await retained.remove()
    else return
  }
  await dependencies.enqueue(intakeId)
}

export async function enqueueCopyrightEmailIntakeAndWait(intakeId: string): Promise<void> {
  const { data, opts } = buildCopyrightEmailIntakeJob(intakeId)
  await ai_agents.add('copyright-email-intake', data, opts)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'copyright-email-intake')
}
