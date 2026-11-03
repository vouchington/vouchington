import type { Job, Worker } from 'glide-mq'
import { createWorker } from '@data-stores/valkey-glide-mq'
import { recordSpendCapBreach } from '@modules/on-error'
import { isModelProviderError } from '@vouchington/ai/providers'
import { isOpenAIRateLimitError } from '@vouchington/ai/openai'
import { deferJobForOpenAIRateLimit } from '@modules/openai-utils/rate-limit'
import { getWorkerConcurrency, parseEnvPositiveInt } from '@modules/queue-config'
import { runWithJobTokenAccumulator } from '@agents/_shared'
import { runWithBackgroundResponseJob } from '@agents/_shared/background-response-job-context'
import { wouldStoryPostCallOpenAI } from '../processors/process-story-post.mts'
import { delayForSpendCap } from '../processors/spend-cap-delay.mts'
import {
  AI_AGENT_JOB_PRODUCES_SPEND,
  AI_AGENTS_QUEUE_NAME,
  CLASSIFIER_RUN_BACKOFF,
  type AIAgentJobName,
} from '@queues/ai-agents/config'
import { evaluateSpendCapBreach, SpendCapBreachError } from '@services/ai-usage'
import { processAIAgent } from '../processors.mts'
import { handleModelProviderError } from '../processors/provider-failure.mts'
import { classifierRunBackoffMs } from '../processors/classifier-run-backoff.mts'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import {
  createBackgroundResponseJobContext,
  recoverJobBackgroundResponses,
} from '../processors/background-response-job.mts'

type AIAgentsWorkerDeps = {
  /** Stands in for the provider-backed processors, so a test never reaches a paid model. */
  processAIAgent: typeof processAIAgent
  /** Lets a test see the breach context the worker reports, which only reaches a throttled Sentry message. */
  recordSpendCapBreach: typeof recordSpendCapBreach
}

const defaultDeps: AIAgentsWorkerDeps = {
  processAIAgent,
  recordSpendCapBreach,
}

export async function processAIAgentWorkerJob(
  job: Job<AIAgentJobData>,
  deps: Partial<AIAgentsWorkerDeps> = {},
): Promise<unknown> {
  const dependencies = { ...defaultDeps, ...deps }
  const responseContext = createBackgroundResponseJobContext(job)
  try {
    if (await recoverJobBackgroundResponses(job, responseContext)) return undefined
  } catch (err: unknown) {
    if (isOpenAIRateLimitError(err)) return deferJobForOpenAIRateLimit(err, job)
    throw err
  }

  // Daily spend ceiling (#8773) before the OpenAI-error catch. reconcile-* jobs stay exempt so they
  // can still cancel orphaned billed responses. A breach parks only this job until the queried day
  // boundary; the marked coordinator promotes it when enforcement relaxes.
  if (jobProducesSpend(job)) {
    const breach = await evaluateSpendCapBreach()
    if (breach && (await jobWouldIncurSpend(job))) {
      dependencies.recordSpendCapBreach({
        agentJobName: job.name,
        dailyTotalMicrounits: breach.totalMicrounits,
        dailyCapMicrounits: breach.dailyCapMicrounits,
        reason: breach.reason,
      })
      await delayForSpendCap(job, breach.day)
    }
  }

  try {
    // recordAgentResponseUsage feeds every billed call into this job's tokenLimiter total.
    return await runWithBackgroundResponseJob(responseContext, () =>
      runWithJobTokenAccumulator(
        () => dependencies.processAIAgent(job),
        totalTokens => job.reportTokens(totalTokens),
      ),
    )
  } catch (err: unknown) {
    if (err instanceof SpendCapBreachError) {
      // Mid-loop recheck already recorded the breach; park like the pre-dispatch path.
      await delayForSpendCap(job, err.breach.day)
    }
    if (isModelProviderError(err)) return handleModelProviderError(err, job)
    return deferJobForOpenAIRateLimit(err, job)
  }
}

function jobProducesSpend(job: Job<AIAgentJobData>): boolean {
  return AI_AGENT_JOB_PRODUCES_SPEND[job.name as AIAgentJobName]
}

// DB predicates run only after the cheap static filter and an active breach, so spend-free
// story-post retries do not pay a round trip on every dispatch.
async function jobWouldIncurSpend(job: Job<AIAgentJobData>): Promise<boolean> {
  if (job.name === 'story-post') {
    const data = job.data as import('@queues/ai-agents/types').StoryPostJobData
    return wouldStoryPostCallOpenAI(data.post_id, data.force ?? false)
  }
  return true
}

export function createAIAgentsWorker(): Worker {
  return createWorker(
    AI_AGENTS_QUEUE_NAME,
    (job: Job<AIAgentJobData>): Promise<unknown> => processAIAgentWorkerJob(job),
    {
      dedicatedCommandClient: true,
      concurrency: getWorkerConcurrency('aiAgents', { baseline: 5 }),
      limiter: { max: parseEnvPositiveInt('OPENAI_RPM', 60), duration: 60_000 },
      tokenLimiter: {
        maxTokens: parseEnvPositiveInt('OPENAI_TPM', 500_000),
        duration: 60_000,
        scope: 'queue',
      },
      lockDuration: 300_000,
      stalledInterval: 30_000,
      // Only the `classifier-run` job names this strategy; every other job keeps its own backoff.
      backoffStrategies: { [CLASSIFIER_RUN_BACKOFF.type]: classifierRunBackoffMs },
    },
  )
}
