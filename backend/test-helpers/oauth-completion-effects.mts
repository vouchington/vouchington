import { vi } from 'vitest'
import { emails } from '../queues/emails/queues.mts'
import { findYourFriendsQueue } from '../queues/find-your-friends/queues.mts'
import { readAllQueueJobs } from './queue-jobs.mts'

/** Payloads of the GitHub friend sync jobs queued for one owned account. */
export async function readGithubFriendSyncJobs(accountId: string | undefined) {
  return (await readAllQueueJobs(findYourFriendsQueue)).flatMap(job =>
    job.name === 'syncGithubFriends' &&
    (job.data as { githubAccountId?: string }).githubAccountId === accountId
      ? [job.data]
      : [],
  )
}

/** Payloads of the account security emails queued for one owned address. */
export async function readAccountSecurityEmailJobs(emailAddress: string) {
  return (await readAllQueueJobs(emails)).flatMap(job =>
    job.name === 'processSendAccountSecurityEmail' &&
    (job.data as { input?: { emailAddress?: string } }).input?.emailAddress === emailAddress
      ? [job.data]
      : [],
  )
}

/** Rejects the account security email enqueue for one owned address; other adds reach the real queue. */
export function failOwnedAccountSecurityEmailEnqueue(emailAddress: string, error: Error) {
  const realAdd = emails.add
  return vi.spyOn(emails, 'add').mockImplementation((name, data, opts) => {
    if ((data as { input?: { emailAddress?: string } }).input?.emailAddress === emailAddress)
      return Promise.reject(error)
    return realAdd.call(emails, name, data, opts)
  })
}

/** Rejects the GitHub friend sync enqueue for one owned account; other adds reach the real queue. */
export function failOwnedGithubFriendSyncEnqueue(accountId: string | undefined, error: Error) {
  const realAdd = findYourFriendsQueue.add
  return vi.spyOn(findYourFriendsQueue, 'add').mockImplementation((name, data, opts) => {
    if ((data as { githubAccountId?: string }).githubAccountId === accountId)
      return Promise.reject(error)
    return realAdd.call(findYourFriendsQueue, name, data, opts)
  })
}
