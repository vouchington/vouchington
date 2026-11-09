import '@voucha/test-helpers/vitest.setup.sentry-mock'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Queue, QueueEvents, UnrecoverableError, Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '@queues/ai-agents/config'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { admitModerationRerunForTest } from '@voucha/test-helpers/moderation-rerun-worker'
import { primeOwnedAIAgentNativeStalls } from '@voucha/test-helpers/ai-rerun-native-stall'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { processReconcileAIAgentFailures } from './reconcile-ai-agent-failures.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('native GlideMQ failure reconciliation', () => {
  it('records exact failed report and appeal runs before removing their jobs', async () => {
    const selectedReport = await admitModerationRerunForTest('report')
    const selectedAppeal = await admitModerationRerunForTest('appeal')
    const excludedReport = await admitModerationRerunForTest('report')
    const settings = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const queue = new Queue<AIAgentJobData>(AI_AGENTS_QUEUE_NAME, settings)
    const events = new QueueEvents(AI_AGENTS_QUEUE_NAME, { ...settings, lastEventId: '0' })
    const workers: Worker[] = []
    onTestFinished(async () => {
      for (const worker of workers) await worker.close(true)
      await events.close()
      await queue.obliterate({ force: true })
      await queue.close()
    })
    await events.waitUntilReady()
    const jobIds = [selectedReport.jobId, selectedAppeal.jobId, excludedReport.jobId]
    const activated = new Set<string>()
    const allActivated = Promise.withResolvers<void>()
    const firstWorker = new Worker<AIAgentJobData>(
      AI_AGENTS_QUEUE_NAME,
      async (job: Job<AIAgentJobData>) => {
        if (!jobIds.includes(job.id)) return
        activated.add(job.id)
        if (activated.size === jobIds.length) allActivated.resolve()
        await new Promise<never>(() => {})
      },
      {
        ...settings,
        concurrency: jobIds.length,
        blockTimeout: 100,
        stalledInterval: 100,
        lockDuration: 500,
      },
    )
    workers.push(firstWorker)
    await firstWorker.waitUntilReady()
    await waitForRealGlideEvent(allActivated.promise, 'owned AI jobs activated before native stall')
    await firstWorker.close(true)

    await primeOwnedAIAgentNativeStalls(queue, jobIds)
    const failedIds = new Set<string>()
    const allFailed = Promise.withResolvers<void>()
    events.on('failed', ({ jobId }: { jobId: string }) => {
      if (!jobIds.includes(jobId)) return
      failedIds.add(jobId)
      if (failedIds.size === jobIds.length) allFailed.resolve()
    })
    let resumedHandlerCalls = 0
    const recoveryWorker = new Worker<AIAgentJobData>(
      AI_AGENTS_QUEUE_NAME,
      async (job: Job<AIAgentJobData>) => {
        if (jobIds.includes(job.id)) resumedHandlerCalls++
      },
      {
        ...settings,
        blockTimeout: 100,
        stalledInterval: 100,
        lockDuration: 500,
        maxStalledCount: 2,
      },
    )
    workers.push(recoveryWorker)
    await recoveryWorker.waitUntilReady()
    try {
      await waitForRealGlideEvent(allFailed.promise, 'native AI stalled-job failures')
    } catch (err) {
      const states = await Promise.all(
        jobIds.map(async id => ({ id, state: await (await queue.getJob(id))?.getState() })),
      )
      throw new Error(
        `Native recovery state: ${JSON.stringify({ failedIds: [...failedIds], states })}`,
        { cause: err },
      )
    }
    expect(resumedHandlerCalls).toBe(0)
    for (const id of jobIds) expect(await (await queue.getJob(id))?.getState()).toBe('failed')
    expect(
      (await selectedReport.request.get(selectedReport.resultPath).expect(200)).body.status,
    ).toBe('active')
    expect(
      (await selectedAppeal.request.get(selectedAppeal.resultPath).expect(200)).body.status,
    ).toBe('active')

    const result = await processReconcileAIAgentFailures({
      jobIds: [selectedReport.jobId, selectedAppeal.jobId],
      batchSize: 2,
      historyLimit: 1,
    })
    expect(result.terminalized).toBe(2)
    expect(result.removed).toBeGreaterThanOrEqual(2)
    expect(
      (await selectedReport.request.get(selectedReport.resultPath).expect(200)).body.status,
    ).toBe('failed')
    expect(
      (await selectedAppeal.request.get(selectedAppeal.resultPath).expect(200)).body.status,
    ).toBe('failed')
    expect(await queue.getJob(selectedReport.jobId)).toBeNull()
    expect(await queue.getJob(selectedAppeal.jobId)).toBeNull()
    expect(
      (await excludedReport.request.get(excludedReport.resultPath).expect(200)).body.status,
    ).toBe('active')
    expect(await (await queue.getJob(excludedReport.jobId))?.getState()).toBe('failed')
    await recoveryWorker.pause()
    const ordinaryIds: string[] = [randomUUID(), randomUUID()]
    const ordinaryFailed = new Set<string>()
    const allOrdinaryFailed = Promise.withResolvers<void>()
    events.on('failed', ({ jobId }: { jobId: string }) => {
      if (!ordinaryIds.includes(jobId)) return
      ordinaryFailed.add(jobId)
      if (ordinaryFailed.size === ordinaryIds.length) allOrdinaryFailed.resolve()
    })
    for (const id of ordinaryIds) {
      const job = await queue.add(
        'story-post',
        { post_id: randomUUID() },
        { ...AI_AGENTS_DEFAULTS, attempts: 1, jobId: id },
      )
      expect(job?.opts.removeOnFail).toBe(false)
    }
    const ordinaryWorker = new Worker<AIAgentJobData>(
      AI_AGENTS_QUEUE_NAME,
      async () => {
        throw new UnrecoverableError('Owned ordinary job failure')
      },
      { ...settings, blockTimeout: 100 },
    )
    workers.push(ordinaryWorker)
    await ordinaryWorker.waitUntilReady()
    await waitForRealGlideEvent(allOrdinaryFailed.promise, 'ordinary AI failures')
    expect(
      (await Promise.all(ordinaryIds.map(id => queue.getJob(id)))).filter(Boolean),
    ).toHaveLength(2)

    const history = await processReconcileAIAgentFailures({ batchSize: 4, historyLimit: 1 })
    expect(history.removed).toBe(2)
    expect(
      (await excludedReport.request.get(excludedReport.resultPath).expect(200)).body.status,
    ).toBe('failed')
    const ordinaryRetained = await Promise.all(ordinaryIds.map(id => queue.getJob(id)))
    expect(ordinaryRetained.filter(Boolean)).toHaveLength(1)

    await ordinaryWorker.pause()
    const next = await selectedReport.request.post(selectedReport.path).send({}).expect(202)
    expect(next.body.run_id).not.toBe(selectedReport.runId)
    expect(
      (await selectedReport.request.get(`${selectedReport.path}/${next.body.run_id}`).expect(200))
        .body.status,
    ).toBe('active')
    expect(
      (await selectedReport.request.get(selectedReport.resultPath).expect(200)).body.status,
    ).toBe('failed')
  })
})
