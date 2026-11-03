import { vi } from 'vitest'
import { ai_agents } from '../../../queues/ai-agents/queues.mts'

type RecordedAgentAdd = { name: string; data: unknown }

/**
 * Record every add on the real `ai_agents` queue while still admitting it. Await `admissions`
 * before reading `calls` so a fire-and-forget enqueue has been recorded; restore the spy with
 * `vi.restoreAllMocks()`.
 */
export function trackAgentQueueAdds(): {
  admissions: Promise<unknown>[]
  calls: RecordedAgentAdd[]
} {
  const add = ai_agents.add
  const admissions: Promise<unknown>[] = []
  const calls: RecordedAgentAdd[] = []
  vi.spyOn(ai_agents, 'add').mockImplementation((...args: Parameters<typeof add>) => {
    calls.push({ name: args[0], data: args[1] })
    const admission = Reflect.apply(add, ai_agents, args) as ReturnType<typeof add>
    admissions.push(admission)
    return admission
  })
  return { admissions, calls }
}
