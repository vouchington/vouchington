import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  FIND_YOUR_FRIENDS_DISPATCH_JOB,
  FIND_YOUR_FRIENDS_ENQUEUE_DISPATCH_JOB,
  FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB,
  FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB,
  FIND_YOUR_FRIENDS_SYNC_X_JOB,
} from '@queues/background/enqueues/find-your-friends-jobs'
import { FIND_YOUR_FRIENDS_ORDERING } from '@queues/find-your-friends/config'
import { findYourFriendsHandlers } from './workers.mts'

function handlerFor(name: string) {
  return findYourFriendsHandlers.find(handler => handler.job.name === name)!
}

function jobWith(data: object, orderingKey?: string): Job {
  return { data, opts: orderingKey ? { ordering: { key: orderingKey } } : {} } as unknown as Job
}

describe('find-your-friends sync handlers', () => {
  it.each([
    [FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB, { facebookUserId: 'facebook-1' }],
    [FIND_YOUR_FRIENDS_SYNC_X_JOB, { xUserId: 'x-1' }],
    [FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB, { githubUserId: 'github-1' }],
  ])('refuses %s without its provider lane', (job, data) => {
    expect(() => handlerFor(job.name).handle(jobWith(data))).toThrow(
      'Unknown ordering key: undefined',
    )
  })

  it.each([
    [FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB, 'sync_facebook'],
    [FIND_YOUR_FRIENDS_SYNC_X_JOB, 'sync_x'],
    [FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB, 'sync_github'],
  ] as const)('requires a payload for %s inside its lane', (job, lane) => {
    expect(() =>
      handlerFor(job.name).handle({
        data: undefined,
        opts: { ordering: { key: FIND_YOUR_FRIENDS_ORDERING[lane].key } },
      } as unknown as Job),
    ).toThrow('is required')
  })

  it.each([
    [FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB, 'sync_facebook', 'facebookUserId'],
    [FIND_YOUR_FRIENDS_SYNC_X_JOB, 'sync_x', 'xUserId'],
    [FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB, 'sync_github', 'githubUserId'],
  ] as const)('syncs nothing for an unlinked provider account of %s', async (job, lane, field) => {
    await expect(
      handlerFor(job.name).handle(
        jobWith({ [field]: randomUUID() }, FIND_YOUR_FRIENDS_ORDERING[lane].key),
      ),
    ).resolves.toBeUndefined()
  })

  it('enqueues the dispatcher from the scheduled enqueue job', async () => {
    await expect(
      handlerFor(FIND_YOUR_FRIENDS_ENQUEUE_DISPATCH_JOB.name).handle(jobWith({})),
    ).resolves.toMatchObject({ name: FIND_YOUR_FRIENDS_DISPATCH_JOB.name })
  })

  it('finishes a dispatch sweep whose providers are all done without rescheduling it', async () => {
    const saved: unknown[] = []
    const job = {
      data: {
        sweepStartedAt: new Date().toISOString(),
        upperIds: { facebook: null, x: null, github: null },
        finishedProviders: ['facebook', 'x', 'github'],
      },
      updateData: (data: unknown) => {
        saved.push(data)
        return Promise.resolve()
      },
      moveToDelayed: () => Promise.reject(new Error('a finished sweep must not be rescheduled')),
    } as unknown as Job

    await expect(handlerFor(FIND_YOUR_FRIENDS_DISPATCH_JOB.name).handle(job)).resolves.toEqual({
      count: 0,
      hasMore: false,
    })
    expect(saved).not.toHaveLength(0)
  })

  it('refuses a sync job carrying another provider lane', () => {
    expect(() =>
      handlerFor(FIND_YOUR_FRIENDS_SYNC_X_JOB.name).handle(
        jobWith({ xUserId: 'x-1' }, FIND_YOUR_FRIENDS_ORDERING.sync_github.key),
      ),
    ).toThrow(`Unknown ordering key: ${FIND_YOUR_FRIENDS_ORDERING.sync_github.key}`)
  })

  it.each([
    [FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB, 'sync_facebook', 'facebookUserId is required'],
    [FIND_YOUR_FRIENDS_SYNC_X_JOB, 'sync_x', 'xUserId is required'],
    [FIND_YOUR_FRIENDS_SYNC_GITHUB_JOB, 'sync_github', 'githubUserId is required'],
  ] as const)('requires the provider user id of %s inside its lane', (job, lane, message) => {
    expect(() =>
      handlerFor(job.name).handle(jobWith({}, FIND_YOUR_FRIENDS_ORDERING[lane].key)),
    ).toThrow(message)
  })
})
