import { vi } from 'vitest'
import { ai_agents } from '../../../queues/ai-agents/queues.mts'

type RecordedAgentAdd = { name: string; data: unknown }

/**
 * Record every add, and every job of an addBulk, on the real `ai_agents` queue while still
 * admitting it. Await `admissions`
 * before reading `calls` so a fire-and-forget enqueue has been recorded; restore the spy with
 * `vi.restoreAllMocks()`.
 */
export function trackAgentQueueAdds(): {
  admissions: Promise<unknown>[]
  calls: RecordedAgentAdd[]
} {
  const add = ai_agents.add
  const addBulk = ai_agents.addBulk
  const admissions: Promise<unknown>[] = []
  const calls: RecordedAgentAdd[] = []
  vi.spyOn(ai_agents, 'add').mockImplementation((...args: Parameters<typeof add>) => {
    calls.push({ name: args[0], data: args[1] })
    const admission = Reflect.apply(add, ai_agents, args) as ReturnType<typeof add>
    admissions.push(admission)
    return admission
  })
  vi.spyOn(ai_agents, 'addBulk').mockImplementation((...args: Parameters<typeof addBulk>) => {
    for (const job of args[0]) calls.push({ name: job.name, data: job.data })
    const admission = Reflect.apply(addBulk, ai_agents, args) as ReturnType<typeof addBulk>
    admissions.push(admission)
    return admission
  })
  return { admissions, calls }
}
