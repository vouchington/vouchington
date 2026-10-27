import { onTestFinished, vi } from 'vitest'
import { emails } from '../queues/emails/queues.mts'
import { readEnqueuedJob } from './queue-jobs.mts'

/** Observe real queue admission without replacing the enqueue or starting a global email worker. */
export async function captureTestAccountSecurityEmail(
  emailAddress: string,
  change: () => Promise<unknown>,
) {
  const add = vi.spyOn(emails, 'add')
  onTestFinished(() => add.mockRestore())
  await change()
  const index = add.mock.calls.findIndex(
    ([name, data]) =>
      name === 'processSendAccountSecurityEmail' &&
      (data as { input?: { emailAddress?: string } }).input?.emailAddress === emailAddress,
  )
  if (index < 0) throw new Error('Expected security email admission for the owned address')
  const result = add.mock.results[index]
  if (!result || result.type !== 'return')
    throw new Error('Expected successful security email admission')
  return readEnqueuedJob(emails, await result.value)
}

/** Count owned admissions after the returned mutation and all its postcommit work finish. */
export async function countTestAccountSecurityEmailAdmissions(
  emailAddress: string,
  change: () => Promise<unknown>,
): Promise<number> {
  const add = vi.spyOn(emails, 'add')
  onTestFinished(() => add.mockRestore())
  const before = add.mock.calls.length
  await change()
  return add.mock.calls
    .slice(before)
    .filter(
      ([name, data]) =>
        name === 'processSendAccountSecurityEmail' &&
        (data as { input?: { emailAddress?: string } }).input?.emailAddress === emailAddress,
    ).length
}
