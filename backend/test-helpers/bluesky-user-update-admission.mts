import { vi } from 'vitest'
import { runInsideTestWorkerProcessor } from '@vouchington/worker-runtime/testing'
import { background } from '@queues/background/queues'
import {
  ENTITY_LISTENERS_DOMAIN,
  ENTITY_LISTENERS_USER_UPDATED_JOB,
} from '@queues/background/enqueues/entity-listeners-jobs'
import { holdBackgroundDomain } from '../../test-helpers/shared-background-worker.mts'

function isUserUpdatedJob(name: string, data: unknown, userId: string): boolean {
  return (
    name === ENTITY_LISTENERS_USER_UPDATED_JOB.name &&
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    data.id === userId
  )
}

export function mockUserUpdatedJobAdd(
  userId: string,
  onMatch: (
    add: typeof background.add,
    name: Parameters<typeof background.add>[0],
    data: Parameters<typeof background.add>[1],
    options: Parameters<typeof background.add>[2],
  ) => ReturnType<typeof background.add>,
) {
  const originalAdd = background.add
  const add = (...args: Parameters<typeof background.add>) => originalAdd.call(background, ...args)
  return vi.spyOn(background, 'add').mockImplementation((name, data, options) => {
    if (!isUserUpdatedJob(name, data, userId)) return add(name, data, options)
    const addWithoutWorkerFlush = (...args: Parameters<typeof background.add>) =>
      runInsideTestWorkerProcessor(() => add(...args))
    return onMatch(addWithoutWorkerFlush, name, data, options)
  })
}

export function holdUserUpdatedAdmission(userId: string) {
  const releaseDomain = holdBackgroundDomain(ENTITY_LISTENERS_DOMAIN.domain)
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const finished = Promise.withResolvers<void>()
  const admittedJobs: Awaited<ReturnType<typeof background.add>>[] = []
  let started = false
  const addSpy = mockUserUpdatedJobAdd(userId, async (add, name, data, options) => {
    started = true
    entered.resolve()
    await release.promise
    try {
      const admittedJob = await add(name, data, options)
      admittedJobs.push(admittedJob)
      return admittedJob
    } finally {
      finished.resolve()
    }
  })
  return {
    entered: entered.promise,
    finishAdmission: async () => {
      release.resolve()
      if (started) await finished.promise
    },
    cleanup: async (operation: Promise<unknown> | undefined) => {
      release.resolve()
      try {
        if (started) await finished.promise
        await operation?.catch(() => undefined)
      } finally {
        try {
          addSpy.mockRestore()
        } finally {
          try {
            await releaseDomain()
          } finally {
            for (const admittedJob of admittedJobs) {
              if (!admittedJob) continue
              const persisted = await background.getJob(admittedJob.id)
              await persisted?.remove()
            }
          }
        }
      }
    },
    readAdmittedJob: async () => {
      if (admittedJobs.length !== 1)
        throw new Error(`Expected one user-update job, got ${admittedJobs.length}`)
      const [admittedJob] = admittedJobs
      if (!admittedJob) throw new Error('The user-update job was not admitted')
      const persisted = await background.getJob(admittedJob.id)
      if (!persisted) throw new Error(`No persisted user-update job ${admittedJob.id}`)
      return persisted
    },
    get started() {
      return started
    },
    jobName: ENTITY_LISTENERS_USER_UPDATED_JOB.name,
  }
}
