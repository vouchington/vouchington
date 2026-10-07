import { AsyncLocalStorage } from 'node:async_hooks'
import type { Job } from 'glide-mq'
import { vi } from 'vitest'
type Target = 'low' | 'high'
type QueueKind = 'entity' | 'election'
type End = { failed: boolean; error?: Error }
export async function runWithOwnedPostElectionVoteStats(
  prepare: () => Promise<{
    targets: { lowScoreId: string; highScoreId: string }
    actions: Array<() => Promise<unknown>>
  }>,
) {
  const retry = await import('../data-stores/valkey-glide-mq/glide-mq-retry.mts')
  const statsQueue = (await import('../queues/elections/queues.mts')).elections
  const entityQueue = (await import('../queues/entity-listeners/queues.mts')).entitiesListeners
  const targets = new Map<string, Target>()
  const ends = new Map<string, End>()
  const waiters = new Map<string, (end: End) => void>()
  const entityJobs: Array<{ entityId: string; job: Promise<Job> }> = []
  const admissions: Array<{ phase: 'creation' | 'votes'; ids: string[]; jobs: Promise<unknown> }> =
    []
  const deadline = AbortSignal.timeout(25_000)
  let phase: 'creation' | 'votes' = 'creation'
  const end = (queue: QueueKind, job: Job | undefined, failed: boolean, error?: Error) => {
    if (!job?.id) return
    const event = { failed, error }
    const key = `${queue}:${job.id}`
    ends.set(key, event)
    waiters.get(key)?.(event)
  }
  const onStatsDone = (job: Job) => {
    if (job.name === 'processUpdateElectionVoteStats') end('election', job, false)
  }
  const onStatsFail = (job: Job | undefined, error: Error) => {
    if (job?.name === 'processUpdateElectionVoteStats') end('election', job, true, error)
  }
  const onPostDone = (job: Job) => {
    if (job.name === 'processPostCreated') end('entity', job, false)
  }
  const onPostFail = (job: Job | undefined, error: Error) => {
    if (job?.name === 'processPostCreated') end('entity', job, true, error)
  }
  const wait = (queue: QueueKind, id: string) => {
    const key = `${queue}:${id}`
    const known = ends.get(key)
    if (known) return Promise.resolve(known)
    return new Promise<End>((resolve, reject) => {
      const timeout = () => {
        waiters.delete(key)
        deadline.removeEventListener('abort', timeout)
        reject(new Error(`Timed out observing owned ${queue} job ${id}`))
      }
      waiters.set(key, event => {
        deadline.removeEventListener('abort', timeout)
        waiters.delete(key)
        resolve(event)
      })
      deadline.addEventListener('abort', timeout, { once: true })
      if (deadline.aborted) timeout()
    })
  }
  const add = entityQueue.add
  const addSpy = vi.spyOn(entityQueue, 'add').mockImplementation((name, data, options) => {
    const job = Reflect.apply(add, entityQueue, [name, data, options]) as Promise<Job>
    if (name === 'processPostCreated') {
      const entityId = (data as { id: string }).id
      entityJobs.push({ entityId, job })
      void job.catch(() => undefined)
    }
    return job
  })
  const context = new AsyncLocalStorage<(typeof admissions)[number]>()
  const retryReal = retry.retryTransientEnqueue
  const retrySpy = vi.spyOn(retry, 'retryTransientEnqueue').mockImplementation(fn => {
    const item = { phase, ids: [] as string[], jobs: Promise.resolve() as Promise<unknown> }
    const jobs = context.run(item, () => retryReal(fn))
    item.jobs = jobs
    void jobs.catch(() => undefined)
    return jobs
  })
  const bulkReal = statsQueue.addBulk
  const bulkSpy = vi.spyOn(statsQueue, 'addBulk').mockImplementation(jobs => {
    const item = context.getStore()
    const stats = jobs.filter(job => job.name === 'processUpdateElectionVoteStats')
    if (item && stats.length && !admissions.includes(item)) {
      item.ids = stats.map(job => (job.data as { electionId: string }).electionId)
      admissions.push(item)
    }
    return Reflect.apply(bulkReal, statsQueue, [jobs])
  })
  const { elections } = await import('../workers/elections/workers.mts')
  const { entitiesListeners } = await import('../workers/entity-listeners/workers.mts')
  elections.on('completed', onStatsDone)
  elections.on('failed', onStatsFail)
  entitiesListeners.on('completed', onPostDone)
  entitiesListeners.on('failed', onPostFail)
  try {
    const ready = await prepare()
    targets.set(ready.targets.lowScoreId, 'low')
    targets.set(ready.targets.highScoreId, 'high')
    for (const id of targets.keys()) {
      const attempts = entityJobs.filter(item => item.entityId === id)
      if (!attempts.length) throw new Error(`No creator enqueue observed for ${id}`)
      const jobs = await Promise.all(attempts.map(item => item.job))
      for (const job of new Map(jobs.map(job => [job.id, job])).values()) {
        const result = await wait('entity', job.id)
        if (result.failed) throw new Error(`Creator job ${job.id} failed`, { cause: result.error })
      }
    }
    const creation = admissions.filter(
      item => item.phase === 'creation' && item.ids.some(id => targets.has(id)),
    )
    const createdCounts = new Map<string, number>()
    for (const item of creation)
      for (const id of item.ids.filter(id => targets.has(id)))
        createdCounts.set(id, (createdCounts.get(id) ?? 0) + 1)
    if (creation.length !== 2 || [...targets.keys()].some(id => createdCounts.get(id) !== 1))
      throw new Error(
        `Expected two creator stats enqueues; observed ${JSON.stringify([...createdCounts])}`,
      )
    await Promise.all(creation.map(item => item.jobs))
    phase = 'votes'
    for (const action of ready.actions) await action()
    const votes = admissions.filter(
      item => item.phase === 'votes' && item.ids.some(id => targets.has(id)),
    )
    const voteCounts = new Map<string, number>()
    for (const item of votes)
      for (const id of item.ids.filter(id => targets.has(id)))
        voteCounts.set(id, (voteCounts.get(id) ?? 0) + 1)
    const low = ready.targets.lowScoreId
    const high = ready.targets.highScoreId
    if (votes.length !== 3 || voteCounts.get(low) !== 1 || voteCounts.get(high) !== 2)
      throw new Error(
        `Expected logical vote enqueues low=1/high=2; observed ${JSON.stringify([...voteCounts])}`,
      )
    await Promise.all(votes.map(item => item.jobs))

    const owned = new Map<Target, Map<string, string>>([
      ['low', new Map()],
      ['high', new Map()],
    ])
    for (const item of [...creation, ...votes]) {
      const jobs = await item.jobs
      for (const [index, id] of item.ids.entries()) {
        const target = targets.get(id)
        if (!target) continue
        const job = Array.isArray(jobs) ? (jobs[index] as Job | null | undefined) : undefined
        if (!job) {
          if (!owned.get(target)!.size)
            throw new Error(`Unowned deduplicated ${target} stats enqueue`)
        } else owned.get(target)!.set(job.id, id)
      }
    }
    const ownedJobs = [...owned.values()].flatMap(group => [...group])
    const completedJobs = await Promise.all(
      ownedJobs.map(async ([jobId, electionId]) => {
        const result = await wait('election', jobId)
        if (result.failed) throw new Error(`Stats job ${jobId} failed`, { cause: result.error })
        return { jobId, target: targets.get(electionId)! }
      }),
    )
    return {
      targets: ready.targets,
      logicalAdmissions: { creation: creation.length, votes: votes.length },
      ownedJobIds: ownedJobs.map(([id]) => id),
      completedJobs,
    }
  } finally {
    try {
      await Promise.all(
        entityJobs.map(async ({ job }) => {
          const result = await job.catch(() => null)
          if (result) await wait('entity', result.id).catch(() => undefined)
        }),
      )
      await Promise.all(
        admissions.map(async item => {
          const result = await item.jobs.catch(() => null)
          if (Array.isArray(result))
            await Promise.all(
              result
                .filter(Boolean)
                .map((job: Job) => wait('election', job.id).catch(() => undefined)),
            )
        }),
      )
    } finally {
      elections.off('completed', onStatsDone)
      elections.off('failed', onStatsFail)
      entitiesListeners.off('completed', onPostDone)
      entitiesListeners.off('failed', onPostFail)
      addSpy.mockRestore()
      bulkSpy.mockRestore()
      retrySpy.mockRestore()
    }
  }
}
