import { describe, expect, it, vi } from 'vitest'
import {
  countTopicElectionVoteRowsForUser,
  createTestUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createPlatformAccountTestUser,
  type PlatformAccountTestKind,
} from '@voucha/test-helpers/account-types'
import { createInstanceFromHostname } from './create-instance.mts'

const KINDS: PlatformAccountTestKind[] = ['official', 'system', 'ai_agent']
const hostnameFor = (label: string) =>
  `${label}-${Math.random().toString(36).slice(2, 10)}.example.com`

describe('createInstanceFromHostname automatic vote for platform accounts', () => {
  it.each(KINDS)('creates the instance for a %s account without voting', async kind => {
    const account = await createPlatformAccountTestUser(kind)

    const result = await createInstanceFromHostname(
      account,
      WEB_PROVENANCE,
      hostnameFor('fedi-platform-new'),
    )

    expect(result.status).toBe('created')
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
  })

  it.each(KINDS)('upvotes an existing instance for a %s account without voting', async kind => {
    const member = await createTestUser()
    const account = await createPlatformAccountTestUser(kind)
    const hostname = hostnameFor('fedi-platform-existing')
    const first = await createInstanceFromHostname(member, WEB_PROVENANCE, hostname)

    const second = await createInstanceFromHostname(account, WEB_PROVENANCE, hostname)

    expect(second).toMatchObject({ status: 'upvoted', topic_id: first.topic_id })
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
  })

  it('writes no vote for a platform account that loses a concurrent creation race', async () => {
    const member = await createTestUser()
    const account = await createPlatformAccountTestUser('official')
    const hostname = hostnameFor('fedi-platform-race')
    // Hold both callers in classification until each has missed the existing-instance lookup, so
    // exactly one of them loses the insert and takes the race-existing path.
    let arrived = 0
    let release!: () => void
    const bothArrived = new Promise<void>(resolve => (release = resolve))
    const classifyInstance = vi.fn<(hostname: string) => Promise<never>>(async () => {
      if (++arrived === 2) release()
      await bothArrived
      throw new Error('classification unavailable')
    })

    const results = await Promise.all([
      createInstanceFromHostname(account, WEB_PROVENANCE, hostname, classifyInstance),
      createInstanceFromHostname(member, WEB_PROVENANCE, hostname, classifyInstance),
    ])

    expect(results.map(result => result.status).toSorted()).toEqual(['created', 'upvoted'])
    expect(results[0].topic_id).toBe(results[1].topic_id)
    expect(await countTopicElectionVoteRowsForUser(account.id)).toBe(0)
  })

  it('still casts the automatic +1 for a member on a new and on an existing instance', async () => {
    const creator = await createTestUser()
    const joiner = await createTestUser()
    const hostname = hostnameFor('fedi-member-vote')

    await createInstanceFromHostname(creator, WEB_PROVENANCE, hostname)
    await createInstanceFromHostname(joiner, WEB_PROVENANCE, hostname)

    await vi.waitFor(async () => {
      expect(await countTopicElectionVoteRowsForUser(creator.id)).toBe(1)
      expect(await countTopicElectionVoteRowsForUser(joiner.id)).toBe(1)
    })
  })
})
