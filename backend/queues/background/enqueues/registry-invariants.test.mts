import { describe, expect, it } from 'vitest'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'
import { assertRegistryInvariants } from './registry-invariants.mts'

const sesDomain = defineBackgroundDomain({
  domain: 'ses-inbound',
  workerConcurrency: 1,
})
const moderationDomain = defineBackgroundDomain({
  domain: 'openai-moderation',
  workerConcurrency: 1,
})
const sesJob = defineBackgroundJob(sesDomain, { name: 'process', priority: 10 })
const moderationJob = defineBackgroundJob(moderationDomain, { name: 'post', priority: 10 })
const domains = [sesDomain, moderationDomain]

describe('background registry invariants', () => {
  it('accepts unique jobs whose domains are each registered once and configured', () => {
    expect(() =>
      assertRegistryInvariants([sesJob, moderationJob], domains, [
        'ses-inbound',
        'openai-moderation',
      ]),
    ).not.toThrow()
  })

  it('refuses a job name registered twice', () => {
    expect(() =>
      assertRegistryInvariants([sesJob, sesJob], domains, ['ses-inbound', 'openai-moderation']),
    ).toThrow('Background job names must be unique across domains')
  })

  it('refuses a domain registered twice', () => {
    expect(() =>
      assertRegistryInvariants([sesJob], [sesDomain, sesDomain], ['ses-inbound']),
    ).toThrow('Background domains must be registered once')
  })

  it('refuses a configured domain that has no definition', () => {
    expect(() =>
      assertRegistryInvariants([sesJob], [sesDomain], ['ses-inbound', 'openai-moderation']),
    ).toThrow('Every background domain needs a domain definition')
  })

  it('refuses a job that names an unregistered domain', () => {
    expect(() =>
      assertRegistryInvariants([sesJob, moderationJob], [sesDomain], ['ses-inbound']),
    ).toThrow('Job openai-moderation.post names an unregistered domain')
  })
})
