import { Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import onError, { recordOpenAiSpendCapBreach } from '@modules/on-error'
import { handleOpenAIRateLimit } from '@modules/openai-utils/rate-limit'
import { getWorkerConcurrency, parseEnvPositiveInt } from '@modules/queue-config'
import { runWithJobTokenAccumulator } from '@agents/_shared'
import { wouldStoryPostCallOpenAI } from '../processors/process-story-post.mts'
import { delayForOpenAiSpendCap } from '../processors/spend-cap-delay.mts'
import {
  AI_AGENT_JOB_PRODUCES_SPEND,
  AI_AGENTS_QUEUE_NAME,
  type AIAgentJobName,
} from '@queues/ai-agents/config'
import {
  evaluateOpenAiSpendCapBreach,
  getAccountingUncertaintySource,
  getDailyAiCostTotalMicrounits,
  getOpenAiSpendCapFields,
  openAiSpendCapConfig,
  OpenAiSpendCapBreachError,
} from '@services/ai-usage'
import { AI_GENERATED_MODERATOR_SLUG } from '@services/moderation'
import { processAIAgent } from '../processors.mts'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { registerOpenAiSpendCapRecheck } from '../processors/spend-cap-recheck.mts'

type AIAgentsWorkerDeps = {
  WorkerCtor: typeof Worker
  processAIAgent: typeof processAIAgent
  handleOpenAIRateLimit: (error: unknown, worker: Worker) => Promise<unknown>
  waitForOpenAiSpendCapConfig: () => Promise<void>
  getOpenAiSpendCapFields: typeof getOpenAiSpendCapFields
  getDailyAiCostTotalMicrounits: typeof getDailyAiCostTotalMicrounits
  getAccountingUncertaintySource: typeof getAccountingUncertaintySource
  recordOpenAiSpendCapBreach: typeof recordOpenAiSpendCapBreach
  reportOpenAiSpendCapRegistrationFailure: typeof onError
  queueName: typeof AI_AGENTS_QUEUE_NAME
  connection: typeof workerQueueConnection
  prefix: typeof workerQueuePrefix
  concurrency: number
  openAIRateLimitPerMinute: number
  openAITokenLimitPerMinute: number
  registerOpenAiSpendCapRecheck: typeof registerOpenAiSpendCapRecheck
}

const defaultDeps: AIAgentsWorkerDeps = {
  WorkerCtor: Worker,
  processAIAgent,
  handleOpenAIRateLimit,
  waitForOpenAiSpendCapConfig: () => openAiSpendCapConfig.waitForInitialization(),
  getOpenAiSpendCapFields,
  getDailyAiCostTotalMicrounits,
  getAccountingUncertaintySource,
  recordOpenAiSpendCapBreach,
  reportOpenAiSpendCapRegistrationFailure: onError,
  queueName: AI_AGENTS_QUEUE_NAME,
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('aiAgents', { baseline: 5 }),
  openAIRateLimitPerMinute: parseEnvPositiveInt('OPENAI_RPM', 60),
  openAITokenLimitPerMinute: parseEnvPositiveInt('OPENAI_TPM', 500_000),
  registerOpenAiSpendCapRecheck,
}

export async function processAIAgentWorkerJob(
  job: Job<AIAgentJobData>,
  worker: Worker,
  deps: Partial<AIAgentsWorkerDeps> = {},
): Promise<unknown> {
  const dependencies = { ...defaultDeps, ...deps }

  // Daily spend ceiling (#8773) before the OpenAI-error catch. reconcile-* jobs stay exempt so they
  // can still cancel orphaned billed responses. A breach parks only this job until the queried day
  // boundary; the marked coordinator promotes it when enforcement relaxes.
  if (jobProducesOpenAiSpend(job)) {
    const breach = await evaluateOpenAiSpendCapBreach({
      waitForOpenAiSpendCapConfig: dependencies.waitForOpenAiSpendCapConfig,
      getOpenAiSpendCapFields: dependencies.getOpenAiSpendCapFields,
      getDailyAiCostTotalMicrounits: dependencies.getDailyAiCostTotalMicrounits,
      getAccountingUncertaintySource: dependencies.getAccountingUncertaintySource,
    })
    if (breach && (await jobWouldIncurOpenAiSpend(job))) {
      dependencies.recordOpenAiSpendCapBreach({
        agentJobName: job.name,
        dailyTotalMicrounits: breach.totalMicrounits,
        dailyCapMicrounits: breach.dailyCapMicrounits,
        reason: breach.reason,
        ...(breach.reason === 'accounting_uncertain' && {
          uncertaintySource: breach.uncertaintySource,
        }),
      })
      await delayForOpenAiSpendCap(
        job,
        breach.day,
        dependencies.registerOpenAiSpendCapRecheck,
        dependencies.reportOpenAiSpendCapRegistrationFailure,
      )
    }
  }

  try {
    // recordAgentResponseUsage feeds every billed call into this job's tokenLimiter total.
    return await runWithJobTokenAccumulator(
      () => dependencies.processAIAgent(job),
      totalTokens => job.reportTokens(totalTokens),
    )
  } catch (error: unknown) {
    if (error instanceof OpenAiSpendCapBreachError) {
      // Mid-loop recheck already recorded the breach; park like the pre-dispatch path.
      await delayForOpenAiSpendCap(
        job,
        error.breach.day,
        dependencies.registerOpenAiSpendCapRecheck,
        dependencies.reportOpenAiSpendCapRegistrationFailure,
      )
    }
    return dependencies.handleOpenAIRateLimit(error, worker)
  }
}

// Anthropic chat and the local `ai-generated` moderator never bill OpenAI generation, so they must
// not be parked by this cap. The shared Moderations pre-check is free and writes no ledger row.
function jobProducesOpenAiSpend(job: Job<AIAgentJobData>): boolean {
  if (!AI_AGENT_JOB_PRODUCES_SPEND[job.name as AIAgentJobName]) return false
  if (job.name === 'chat') {
    const chatData = job.data as import('@queues/ai-agents/types').ChatJobData
    return chatData.modelProvider !== 'anthropic'
  }
  if (job.name === 'moderation-prompt') {
    const promptData = job.data as import('@queues/ai-agents/types').ModerationPromptJobData
    return promptData.moderatorSlug !== AI_GENERATED_MODERATOR_SLUG
  }
  return true
}

// DB predicates run only after the cheap static filter and an active breach, so spend-free
// story-post retries do not pay a round trip on every dispatch. Autotagger jobs (post and RSS feed
// item) no longer reach this function at all: they dispatch through the C6 classifier path
// (OpenRouter/Noul, `@agents/autotagger/dispatch-classifier.mts`), never OpenAI, so
// `AI_AGENT_JOB_PRODUCES_SPEND` marks both `false` and `jobProducesOpenAiSpend` short-circuits
// before this is ever called for them.
async function jobWouldIncurOpenAiSpend(job: Job<AIAgentJobData>): Promise<boolean> {
  if (job.name === 'story-post') {
    const storyPostData = job.data as import('@queues/ai-agents/types').StoryPostJobData
    return wouldStoryPostCallOpenAI(storyPostData.post_id, storyPostData.force ?? false)
  }
  return true
}

export function createAIAgentsWorker(deps: Partial<AIAgentsWorkerDeps> = {}): Worker {
  const dependencies = { ...defaultDeps, ...deps }
  let worker!: Worker
  worker = new dependencies.WorkerCtor(
    dependencies.queueName,
    (job: Job<AIAgentJobData>): Promise<unknown> =>
      processAIAgentWorkerJob(job, worker, dependencies),
    {
      connection: dependencies.connection,
      prefix: dependencies.prefix,
      concurrency: dependencies.concurrency,
      limiter: { max: dependencies.openAIRateLimitPerMinute, duration: 60_000 },
      tokenLimiter: {
        maxTokens: dependencies.openAITokenLimitPerMinute,
        duration: 60_000,
        scope: 'queue',
      },
      lockDuration: 300_000,
      stalledInterval: 30_000,
    },
  )
  return worker
}
