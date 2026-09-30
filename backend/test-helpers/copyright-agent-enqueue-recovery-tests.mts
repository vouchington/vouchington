import { afterEach, vi } from 'vitest'

type RetainedCopyrightAgentJob = {
  name: string
  getState(): Promise<string>
  retry(): Promise<void>
  remove(): Promise<void>
}

type CopyrightAgentEnqueueRecoveryDependencies = {
  getJob(id: string, options: { excludeData: true }): Promise<RetainedCopyrightAgentJob | null>
  enqueue(id: string): Promise<void>
}

type AgentQueue = {
  add(...args: never[]): Promise<unknown>
}

/** Call inside the enqueue-recovery `describe` so spies stay inside that suite. */
export function restoreCopyrightAgentEnqueueSpies(): void {
  afterEach(() => {
    vi.restoreAllMocks()
  })
}

export function spyOnCopyrightAgentEnqueue(queue: AgentQueue) {
  return vi.spyOn(queue, 'add').mockResolvedValue({} as never)
}

export function failedCopyrightAgentEnqueueRecovery(jobName: string): {
  retry: ReturnType<typeof vi.fn<() => Promise<void>>>
  enqueue: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>
  dependencies: CopyrightAgentEnqueueRecoveryDependencies
} {
  const retry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)
  return {
    retry,
    enqueue,
    dependencies: {
      getJob: async () =>
        retainedCopyrightAgentJob(jobName, 'failed', {
          retry,
          remove: async () => undefined,
        }),
      enqueue,
    },
  }
}

export function completedCopyrightAgentEnqueueRecovery(jobName: string): {
  remove: ReturnType<typeof vi.fn<() => Promise<void>>>
  enqueue: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>
  dependencies: CopyrightAgentEnqueueRecoveryDependencies
} {
  const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)
  return {
    remove,
    enqueue,
    dependencies: {
      getJob: async () =>
        retainedCopyrightAgentJob(jobName, 'completed', {
          retry: async () => undefined,
          remove,
        }),
      enqueue,
    },
  }
}

function retainedCopyrightAgentJob(
  name: string,
  state: 'failed' | 'completed',
  actions: {
    retry(): Promise<void>
    remove(): Promise<void>
  },
): RetainedCopyrightAgentJob {
  return {
    name,
    getState: async () => state,
    retry: actions.retry,
    remove: actions.remove,
  }
}
