import { describe, expect, it } from 'vitest'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { writeEntityRelations } from './write-relations.mts'
// Register the real guards because writeEntityRelations intentionally has no dependency on their
// owning services.
import '../urls/register-blocked-hostname-guard.mts'
import '../referral-program-link-validations/register-referral-link-guard.mts'
import '../posts/register-post-related-urls-guard.mts'
import {
  beginTransaction,
  createReferralProgramFixture,
  createTestPost,
  createTestUser,
  getEntityRelation,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { addUrl } from '../urls/upsert.mts'

const relatedUrlRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  objectType: 'url',
  predicate: 'related',
})

describe('writeEntityRelations (url validation)', () => {
  it('rejects blocked URL hostnames before writing post related-url relations', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: user! })
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `write-relations-blocked-${random}.example.com`,
      blocked: true,
    })
    const urlId = await insertTestUrl({
      url: `https://write-relations-blocked-${random}.example.com/article`,
      hostnameId,
    })

    await expect(
      writeEntityRelations(relatedUrlRelation, user!, [{ subject: post, object: { id: urlId } }]),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects referral URLs before writing post related-url relations', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: user! })
    const random = Math.random().toString(36).slice(2, 10)
    const fixture = await createReferralProgramFixture({
      createdById: user!.id,
      randomSuffix: random,
      hostname: `write-relations-referral-${random}.example.com`,
      pathname: '/ref/%',
    })
    const hostnameId = await insertTestUrlHostname({ hostname: fixture.hostname })
    const urlId = await insertTestUrl({
      url: `https://${fixture.hostname}/ref/article`,
      hostnameId,
    })

    await expect(
      writeEntityRelations(relatedUrlRelation, user!, [{ subject: post, object: { id: urlId } }]),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects an uncommitted referral URL before writing its relation or vote', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: user! })
    const random = Math.random().toString(36).slice(2, 10)
    const fixture = await createReferralProgramFixture({
      createdById: user!.id,
      randomSuffix: random,
      hostname: `write-relations-transaction-referral-${random}.example.com`,
      pathname: '/ref/%',
    })
    let urlId: string | undefined

    await using query = await beginTransaction()
    const url = await addUrl(user!.id, `https://${fixture.hostname}/ref/article`, {
      client: query.client,
      query,
      skipCreatedEvents: true,
    })
    expect(url).not.toBeNull()
    urlId = url!.id

    await expect(
      writeEntityRelations(
        relatedUrlRelation,
        user!,
        [{ subject: post, object: { id: url!.id } }],
        { query },
      ),
    ).rejects.toMatchObject({ status: 422 })

    await query.commit()

    expect(await getEntityRelation(relatedUrlRelation.table_name, post.id, urlId!)).toEqual([])
  })
})
