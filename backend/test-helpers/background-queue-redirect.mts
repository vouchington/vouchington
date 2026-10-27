import { onTestFinished, vi } from 'vitest'
import type { Queue } from 'glide-mq'

/**
 * Points the production `background` queue singleton at an isolated queue until the test
 * finishes: lookups by job id and the queue namespace follow `isolated`. Module mocks of internal
 * queue modules are disallowed, so this spies on the singleton's own members.
 */
export function redirectBackgroundQueueTo(
  production: Pick<Queue, 'getJob' | 'name'>,
  isolated: Pick<Queue, 'getJob' | 'name'>,
): void {
  const getJob = vi
    .spyOn(production, 'getJob')
    .mockImplementation(async jobId => isolated.getJob(jobId))
  const originalName = Object.getOwnPropertyDescriptor(production, 'name')
  Object.defineProperty(production, 'name', { value: isolated.name, configurable: true })
  onTestFinished(() => {
    getJob.mockRestore()
    if (originalName) Object.defineProperty(production, 'name', originalName)
  })
}
