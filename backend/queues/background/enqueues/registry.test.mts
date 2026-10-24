import { describe, expect, it } from 'vitest'
import { SITEMAPS_ORDERING } from '../../sitemaps/config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'
import { BACKGROUND_DOMAINS, isBackgroundDomain } from '../config.mts'
import {
  BACKGROUND_DOMAIN_DEFINITIONS,
  BACKGROUND_JOBS,
  getBackgroundDomainDefinition,
  getBackgroundJob,
  getBackgroundJobNames,
  getBackgroundWorkerBaseline,
} from './registry.mts'

describe('background registry', () => {
  it('registers every domain once with namespaced, unique job names', () => {
    expect(BACKGROUND_DOMAIN_DEFINITIONS.map(domain => domain.domain).toSorted()).toEqual(
      [...BACKGROUND_DOMAINS].toSorted(),
    )
    expect(new Set(BACKGROUND_JOBS.map(job => job.name)).size).toBe(BACKGROUND_JOBS.length)
    for (const job of BACKGROUND_JOBS) {
      expect(job.name.startsWith(`${job.domain}.`)).toBe(true)
      expect(getBackgroundJob(job.name)).toBe(job)
    }
  })

  it('gives each job of a domain-wide group the domain as its ordering key and limits', () => {
    for (const job of BACKGROUND_JOBS) {
      const { group } = getBackgroundDomainDefinition(job.domain)
      if (group?.kind === 'lanes') continue
      const expected =
        group?.kind === 'domain'
          ? {
              key: job.domain,
              concurrency: group.concurrency,
              ...(group.rateLimit ? { rateLimit: group.rateLimit } : {}),
            }
          : undefined
      expect(job.options.ordering).toEqual(expected)
    }
  })

  it('keeps each domain lane cap equal to its independent lane concurrencies', () => {
    for (const domain of BACKGROUND_DOMAIN_DEFINITIONS) {
      if (domain.group?.kind !== 'lanes') continue
      const lanes = new Map<string, number>()
      // Sitemaps select their fixed lane from job data at enqueue time.
      const orderings =
        domain.domain === 'sitemaps'
          ? Object.values(SITEMAPS_ORDERING)
          : BACKGROUND_JOBS.filter(job => job.domain === domain.domain).map(
              job => job.options.ordering!,
            )
      for (const ordering of orderings) {
        expect(ordering.key.startsWith(`${domain.domain}:`)).toBe(true)
        expect(ordering.concurrency).toBeGreaterThan(0)
        expect(ordering.concurrency).toBe(lanes.get(ordering.key) ?? ordering.concurrency)
        lanes.set(ordering.key, ordering.concurrency!)
      }
      expect([...lanes.values()].reduce((sum, concurrency) => sum + concurrency, 0)).toBe(
        domain.group.cap,
      )
    }
  })

  it('reserves independent ActivityPub cleanup capacity beside both delivery directions', () => {
    const job = (name: string) => getBackgroundJob(`activitypub.${name}`)
    for (const name of ['distributeActivity', 'deliverActivity']) {
      expect(job(name)!.options.ordering).toEqual({ key: 'activitypub:outbound', concurrency: 5 })
    }
    for (const name of ['processDelivery', 'recoverDeliveries', 'rearmFailedDeliveries']) {
      expect(job(name)!.options.ordering).toEqual({ key: 'activitypub:inbound', concurrency: 4 })
    }
    expect(job('cleanupExpiredDeliveries')!.options.ordering).toEqual({
      key: 'activitypub:cleanup',
      concurrency: 1,
    })
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
    expect(getBackgroundWorkerBaseline()).toBe(
      BACKGROUND_DOMAIN_DEFINITIONS.reduce((total, domain) => total + domain.workerConcurrency, 0),
    )
    expect(isBackgroundDomain('ses-inbound')).toBe(true)
    expect(isBackgroundDomain('emails')).toBe(false)
  })

  it('rejects a job or domain that would break the queue contract', () => {
    const domain = defineBackgroundDomain({
      domain: 'ses-inbound',
      group: { kind: 'lanes', cap: 1 },
      workerConcurrency: 1,
    })
    expect(() => defineBackgroundJob(domain, { name: 'a.b', priority: 10 })).toThrow('dot')
    expect(() => defineBackgroundJob(domain, { name: 'ok', priority: 0 })).toThrow('priority')
    expect(() =>
      defineBackgroundJob(domain, { name: 'ok', priority: 10, lockDuration: 0 }),
    ).toThrow('positive integer')
    expect(() =>
      defineBackgroundDomain({
        domain: 'ses-inbound',
        group: { kind: 'domain', concurrency: 0 },
        workerConcurrency: 1,
      }),
    ).toThrow('group concurrency')
    expect(() =>
      defineBackgroundJob(
        defineBackgroundDomain({
          domain: 'ses-inbound',
          group: { kind: 'domain', concurrency: 1 },
          workerConcurrency: 1,
        }),
        { name: 'ok', priority: 10, ordering: { key: 'ses-inbound:override', concurrency: 1 } },
      ),
    ).toThrow('domain-wide')
    expect(
      defineBackgroundJob(domain, { name: 'ok', priority: 10 }).options.ordering,
    ).toBeUndefined()
  })
})
