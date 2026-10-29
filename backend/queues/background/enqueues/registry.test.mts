import { describe, expect, it } from 'vitest'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'
import { BACKGROUND_DOMAINS, isBackgroundDomain } from '../config.mts'
import {
  BACKGROUND_JOBS,
  getBackgroundJob,
  getBackgroundJobNames,
  getBackgroundWorkerBaseline,
} from './registry.mts'

describe('background registry', () => {
  it('registers every domain once with namespaced, unique job names', () => {
    expect([...new Set(BACKGROUND_JOBS.map(job => job.domain))].toSorted()).toEqual(
      [...BACKGROUND_DOMAINS].toSorted(),
    )
    expect(new Set(BACKGROUND_JOBS.map(job => job.name)).size).toBe(BACKGROUND_JOBS.length)
    for (const job of BACKGROUND_JOBS) {
      expect(job.name.startsWith(`${job.domain}.`)).toBe(true)
      expect(getBackgroundJob(job.name)).toBe(job)
    }
  })

  it('gives every job a registered domain-prefixed ordering key', () => {
    for (const job of BACKGROUND_JOBS) {
      const key = job.options.ordering?.key
      expect(key === job.domain || key?.startsWith(`${job.domain}:`)).toBe(true)
    }
  })

  it('reserves independent ActivityPub dispatch, recovery, and delivery lanes', () => {
    const key = (name: string) => getBackgroundJob(`activitypub.${name}`)?.options.ordering?.key
    expect(key('distributeActivity')).toBe('activitypub:outbound-dispatch')
    expect(key('recoverOutboundDistribution')).toBe('activitypub:outbound-recovery')
    expect(key('deliverActivity')).toBe('activitypub:outbound')
    expect(key('processDelivery')).toBe('activitypub:inbound')
  })

  it('keeps mark-all continuation off the notification delivery lane', () => {
    expect(
      getBackgroundJob('notifications.processMarkAllNotificationsRead')?.options.ordering,
    ).toEqual({ key: 'notifications:mark-all-read', concurrency: 1 })
    expect(
      getBackgroundJob('notifications.processDeliverNotificationPushIntent')?.options.ordering?.key,
    ).toBe('notifications')
  })

  it('ranks tasks at the default tier and dispatchers at 100', () => {
    for (const job of BACKGROUND_JOBS) {
      expect([10, 100]).toContain(job.options.priority)
    }
  })

  it('keeps the email-digests dispatchers the lowest tier, behind every send', () => {
    const jobs = BACKGROUND_JOBS.filter(job => job.domain === 'email-digests')
    const dispatchers = jobs.filter(job => job.name.includes('.dispatch'))
    expect(dispatchers).toHaveLength(3)
    expect(dispatchers.every(job => job.options.priority === 100)).toBe(true)
    expect(jobs.filter(job => !dispatchers.includes(job)).map(job => job.options.priority)).toEqual(
      [10, 10, 10, 10, 10],
    )
  })

  it('lists a domain’s job names and sums the worker baselines it replaced', () => {
    for (const domain of BACKGROUND_DOMAINS) {
      expect(getBackgroundJobNames(domain)).toEqual(
        BACKGROUND_JOBS.filter(job => job.domain === domain).map(job => job.name),
      )
    }
    expect(getBackgroundWorkerBaseline()).toBe(123)
    expect(isBackgroundDomain('ses-inbound')).toBe(true)
    expect(isBackgroundDomain('emails')).toBe(false)
  })

  it('rejects a job or domain that would break the queue contract', () => {
    const domain = defineBackgroundDomain({
      domain: 'ses-inbound',
      workerConcurrency: 1,
    })
    expect(() => defineBackgroundJob(domain, { name: 'a.b', priority: 10 })).toThrow('dot')
    expect(() => defineBackgroundJob(domain, { name: 'ok', priority: 0 })).toThrow('priority')
    expect(() =>
      defineBackgroundJob(domain, { name: 'ok', priority: 10, lockDuration: 0 }),
    ).toThrow('positive integer')
    expect(() =>
      defineBackgroundJob(domain, {
        name: 'ok',
        priority: 10,
        ordering: { key: 'other-domain:override' },
      }),
    ).toThrow('Unregistered background ordering key')
    expect(defineBackgroundJob(domain, { name: 'ok', priority: 10 }).options.ordering).toEqual({
      key: 'ses-inbound',
      concurrency: 1,
    })
  })
})
