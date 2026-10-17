import { describe, expect, it } from 'vitest'
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
      const expected =
        group.kind === 'domain'
          ? {
              key: job.domain,
              concurrency: group.concurrency,
              ...(group.rateLimit ? { rateLimit: group.rateLimit } : {}),
            }
          : undefined
      expect(job.options.ordering).toEqual(expected)
    }
  })

  it('ranks tasks at the default tier and dispatchers at 100', () => {
    for (const job of BACKGROUND_JOBS) {
      expect([10, 100]).toContain(job.options.priority)
    }
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
      group: { kind: 'entity' },
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
    expect(
      defineBackgroundJob(domain, { name: 'ok', priority: 10 }).options.ordering,
    ).toBeUndefined()
  })
})
