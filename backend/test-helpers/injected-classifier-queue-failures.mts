import { vi } from 'vitest'
import { ai_agents } from '../queues/ai-agents/queues.mts'

/** Reject one dispatcher admission, leaving other classifier work on the real queue. */
export function rejectNextClassifierRunDispatcherAddForTest(error: Error): () => void {
  const realAdd = ai_agents.add
  let rejected = false
  const spy = vi.spyOn(ai_agents, 'add').mockImplementation((name, data, options) => {
    if (!rejected && name === 'classifier-run-dispatcher') {
      rejected = true
      return Promise.reject(error)
    }
    return Reflect.apply(realAdd, ai_agents, [name, data, options])
  })
  return () => spy.mockRestore()
}
