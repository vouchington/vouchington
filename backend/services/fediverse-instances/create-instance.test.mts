import { describe, it, expect, vi } from 'vitest'
import { createInstanceFromHostname } from './create-instance.mts'
import { generateInstanceDetails, createInstanceInTransaction } from './create-instance-helpers.mts'
import { findExistingInstanceByHostnameId } from './find-existing-instance.mts'
import { getFediverseInstanceAttributes } from './get-attributes.mts'
import { getTopicByAny } from '@services/topics/get'
import { getTopicAliases } from '@services/topics/get-topic-aliases'
import { createTopicAliases } from '@services/topics/aliases'
import { resolveHostname } from '@services/topics/hostname-link'
import { getUrlHostnameById } from '@services/urls-hostnames/get'
import {
  createTestUserDirect,
  insertTestTopic,
  softDeleteTopic,
  mergeTopicForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('generateInstanceDetails', () => {
  it('uses the hostname as-is for name and slugifies it (hyphenating dots) on attempt 0', () => {
    expect(generateInstanceDetails('Example.Com', 0)).toEqual({
      name: 'Example.Com',
      slug: 'example-com',
    })
  })

  it('appends the same random hex suffix to both name and slug on retry attempts', () => {
    const { name, slug } = generateInstanceDetails('example.com', 1)
    expect(slug).toMatch(/^example-com-[0-9a-f]{4}$/)
    const suffix = slug.slice('example-com-'.length)
    expect(name).toBe(`example.com (${suffix})`)
  })
})

describe('createInstanceFromHostname', () => {
  it('continues with unclassified metadata when the injected classifier transport fails', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-classification-failure-${randomSuffix()}.example.com`
    const classifier = vi.fn<(hostname: string) => Promise<never>>(async () => {
      throw new Error('provider unavailable')
    })

    const result = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname, classifier)

    expect(result.status).toBe('created')
    expect(classifier).toHaveBeenCalledWith(hostname)
    const attributes = await getFediverseInstanceAttributes(result.topic_id)
    expect(attributes).toMatchObject({
      software: null,
      protocol: null,
      nodeinfo_raw: null,
    })
  })
  it('creates a new instance topic, links the hostname, and returns created', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-create-${randomSuffix()}.example.com`

    const result = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)

    expect(result.status).toBe('created')
    expect(result.topic_slug).toContain('fedi-create')

    const topic = await getTopicByAny(result.topic_id)
    expect(topic).not.toBeNull()
    expect(topic!.topic_type).toBe('fediverse_instance')
    expect(topic!.hostname_id).not.toBeNull()

    const hostnameId = await resolveHostname(user.id, hostname)
    expect(topic!.hostname_id).toBe(hostnameId)

    // linkHostnameToSourceTopic sets topics.hostname_id but must NOT claim
    // url_hostnames.topic_id — that column means "this whole domain IS this topic," which
    // stays a separate, explicit admin action out of scope for user-suggested instances.
    const urlHostname = await getUrlHostnameById(hostnameId!)
    expect(urlHostname?.topic_id).toBeNull()
  })

  it('claims the instance slug as a topic alias', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-alias-${randomSuffix()}.example.com`
    const result = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)

    await expect(getTopicAliases(result.topic_id)).resolves.toMatchObject({
      results: [result.topic_slug],
    })
  })

  it('returns upvoted status and the same topic for a duplicate hostname submission', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-dup-${randomSuffix()}.example.com`

    const first = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)
    expect(first.status).toBe('created')

    const second = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)
    expect(second.status).toBe('upvoted')
    expect(second.topic_id).toBe(first.topic_id)
    expect(second.topic_slug).toBe(first.topic_slug)
  })

  it('dedups on the normalized hostname regardless of input casing', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const hostname = `Fedi-Case-${suffix}.Example.COM`

    const first = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)
    expect(first.status).toBe('created')

    const second = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname.toLowerCase())
    expect(second.status).toBe('upvoted')
    expect(second.topic_id).toBe(first.topic_id)
  })

  it('retries with a suffixed slug after a slug collision from an unrelated topic', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const hostname = `fedi-slug-collide-${suffix}.example.com`
    const { slug: collidingSlug } = generateInstanceDetails(hostname, 0)

    // Pre-occupy the slug this hostname would generate with an unrelated, non-instance topic
    // so the collision is purely on topics.slug's global uniqueness, not the hostname dedup path.
    await insertTestTopic({
      name: `Unrelated slug holder ${suffix}`,
      slug: collidingSlug,
      createdById: user.id,
    })

    const result = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)

    expect(result.status).toBe('created')
    expect(result.topic_slug).toMatch(new RegExp(`^${collidingSlug}-[0-9a-f]{4}$`))
  })

  it('retries when an unrelated active topic owns the generated canonical alias', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const hostname = `fedi-alias-collide-${suffix}.example.com`
    const { slug: claimedAlias } = generateInstanceDetails(hostname, 0)
    const ownerTopicId = await insertTestTopic({
      name: `Fediverse alias owner ${suffix}`,
      slug: `fedi-alias-owner-${suffix}`,
      createdById: user.id,
    })
    await createTopicAliases(ownerTopicId, claimedAlias)

    const result = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)

    expect(result.status).toBe('created')
    expect(result.topic_slug).not.toBe(claimedAlias)
    expect(result.topic_slug).toMatch(new RegExp(`^${claimedAlias}-[0-9a-f]{4}$`))
    await expect(getTopicAliases(result.topic_id)).resolves.toMatchObject({
      results: expect.arrayContaining([result.topic_slug]),
    })
  })

  it('retries with a suffixed name+slug after a name collision from an unrelated topic', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-name-collide-${randomSuffix()}.example.com`

    // Pre-occupy the exact name this hostname would generate with an unrelated, non-instance
    // topic — idx_topics__name is a global unique index, unscoped by topic_type or lifecycle
    // state, so this collides even though the pre-existing topic has nothing to do with hostnames.
    await insertTestTopic({
      name: hostname,
      slug: `fedi-name-collide-holder-${randomSuffix()}`,
      createdById: user.id,
    })

    const result = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)

    expect(result.status).toBe('created')
    const topic = await getTopicByAny(result.topic_id)
    expect(topic!.name).toMatch(new RegExp(`^${hostname.replace(/\./g, '\\.')} \\([0-9a-f]{4}\\)$`))
  })

  it('degrades to upvote on a concurrent creation race for the same hostname', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-race-${randomSuffix()}.example.com`

    const [a, b] = await Promise.all([
      createInstanceFromHostname(WEB_PROVENANCE, user, hostname),
      createInstanceFromHostname(WEB_PROVENANCE, user, hostname),
    ])

    expect([a.status, b.status].sort()).toEqual(['created', 'upvoted'])
    expect(a.topic_id).toBe(b.topic_id)
  })

  // Regression guard for the active-state dedup filter: idx_topics__fediverse_instance__hostname_id
  // is a PARTIAL unique index scoped to active topics, so a merged/soft-deleted instance topic
  // for a hostname must not block creating a new active one. This breaks if
  // findExistingInstanceByHostnameId ever drops its active-state filter.
  it('does not let a soft-deleted instance topic block a new active one for the same hostname', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-lifecycle-del-${randomSuffix()}.example.com`

    const first = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)
    expect(first.status).toBe('created')
    await softDeleteTopic(first.topic_id, user.id)

    const second = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)
    expect(second.status).toBe('created')
    expect(second.topic_id).not.toBe(first.topic_id)
  })

  it('does not let a merged instance topic block a new active one for the same hostname', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const hostname = `fedi-lifecycle-merge-${suffix}.example.com`

    const first = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)
    expect(first.status).toBe('created')

    const mergeDestTopicId = await insertTestTopic({
      name: `Merge dest ${suffix}`,
      slug: `fedi-lifecycle-merge-dest-${suffix}`,
      createdById: user.id,
    })
    await mergeTopicForTest(first.topic_id, mergeDestTopicId, user.id)

    const second = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)
    expect(second.status).toBe('created')
    expect(second.topic_id).not.toBe(first.topic_id)
  })

  it('throws 422 for an invalid hostname', async () => {
    const user = await createTestUserDirect()
    await expect(
      createInstanceFromHostname(WEB_PROVENANCE, user, 'not a hostname'),
    ).rejects.toMatchObject({
      status: 422,
    })
  })

  // classifyFediverseInstance only supports the four FEDIVERSE_*_HOST config hosts (see
  // instance-classification.mts) — every other hostname, including all fixtures in this file,
  // returns unsupported_host immediately with no fetch. This asserts that best-effort
  // classification degrading to null never blocks creation and leaves the extension columns
  // unclassified for a real-world (non-config) hostname.
  it('creates an instance with unclassified (null) extension columns for a non-config hostname', async () => {
    const user = await createTestUserDirect()
    const hostname = `fedi-unsupported-${randomSuffix()}.example.com`

    const result = await createInstanceFromHostname(WEB_PROVENANCE, user, hostname)
    expect(result.status).toBe('created')

    const attributes = await getFediverseInstanceAttributes(result.topic_id)
    expect(attributes).toMatchObject({
      software: null,
      protocol: null,
      nodeinfo_software_version: null,
      total_users: null,
      monthly_active_users: null,
      open_registrations: null,
      nodeinfo_raw: null,
      integration_status: 'pending',
    })
  })
})

describe('createInstanceInTransaction', () => {
  it('rethrows non-unique-violation database errors instead of swallowing them', async () => {
    const user = await createTestUserDirect()
    // topics.hostname_id REFERENCES url_hostnames ON DELETE RESTRICT — a well-formed but
    // nonexistent hostname UUID trips a foreign-key violation (23503) inside
    // linkHostnameToSourceTopic's UPDATE, not a unique violation (23505). This exercises the
    // rethrow branch in createInstanceInTransaction's catch block without mocking the DB.
    const nonexistentHostnameId = '00000000-0000-0000-0000-000000000000'
    const hostname = `fedi-fk-violation-${randomSuffix()}.example.com`

    await expect(
      createInstanceInTransaction(
        WEB_PROVENANCE,
        user.id,
        nonexistentHostnameId,
        hostname,
        `fedi-fk-slug-${randomSuffix()}`,
        null,
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})

describe('findExistingInstanceByHostnameId', () => {
  it('returns null for a hostname with no instance topic', async () => {
    const user = await createTestUserDirect()
    const hostnameId = await resolveHostname(
      user.id,
      `fedi-find-none-${randomSuffix()}.example.com`,
    )
    expect(await findExistingInstanceByHostnameId(hostnameId!)).toBeNull()
  })
})
