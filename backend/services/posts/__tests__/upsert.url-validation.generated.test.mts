import { it, expect, describe } from 'vitest'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
// Side-effect imports: register the real url guards these tests assert on. This suite
// lives under posts (not entity-relations) because the registrant packages depend on
// entity-relations — importing them from its own tests would close a workspace cycle.
import '@services/urls/register-blocked-hostname-guard'
import '@services/referral-program-link-validations'
import '../register-post-related-urls-guard.mts'
import {
  createReferralProgramFixture,
  createTestPost,
  createTestUser,
  getEntityRelation,
  insertTestUrlHostname,
  insertTestUrl,
} from '@voucha/test-helpers'

describe('upsert.generated (url validation)', () => {
  it('upsertEntityRelation throws 422 when linking post to URL with blocked hostname', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: user! })
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `blocked-er-${random}.example.com`,
      blocked: true,
    })
    const urlId = await insertTestUrl({
      url: `https://blocked-er-${random}.example.com/article`,
      hostnameId,
    })

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'url' && m.predicate === 'related',
    )!

    const error = await upsertEntityRelation(user!, metadata, post, [{ id: urlId }]).catch(e => e)
    expect(error.status).toBe(422)
    expect(error.message).toMatch(/blocked/)
  }, 60_000)

  it('upsertEntityRelation throws 422 when linking post to URL matching a referral program rule', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: user! })
    const random = Math.random().toString(36).slice(2, 10)
    const fixture = await createReferralProgramFixture({
      createdById: user!.id,
      randomSuffix: random,
      hostname: `er-ref-${random}.example.com`,
      pathname: '/ref/%',
    })
    const hostnameId = await insertTestUrlHostname({ hostname: fixture.hostname })
    const urlId = await insertTestUrl({
      url: `https://${fixture.hostname}/ref/abc`,
      hostnameId,
    })

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'url' && m.predicate === 'related',
    )!

    const error = await upsertEntityRelation(user!, metadata, post, [{ id: urlId }]).catch(e => e)
    expect(error.status).toBe(422)
    expect(error.message).toMatch(/referral/i)

    const rows = (await getEntityRelation(
      'relation__post__related__url',
      post.id,
      urlId,
    )) as Array<{
      deleted_at: Date | null
    }>
    expect(rows.length).toBe(0)
  }, 60_000)

  it('upsertEntityRelation throws 422 when only one of multiple URL objects is a referral link', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: user! })
    const random = Math.random().toString(36).slice(2, 10)

    const fixture = await createReferralProgramFixture({
      createdById: user!.id,
      randomSuffix: random,
      hostname: `er-ref-batch-${random}.example.com`,
      pathname: '/ref/%',
    })

    const okHostnameId = await insertTestUrlHostname({
      hostname: `er-ref-batch-ok-${random}.example.com`,
    })
    const okUrlId = await insertTestUrl({
      url: `https://er-ref-batch-ok-${random}.example.com/article`,
      hostnameId: okHostnameId,
    })

    const refHostnameId = await insertTestUrlHostname({ hostname: fixture.hostname })
    const refUrlId = await insertTestUrl({
      url: `https://${fixture.hostname}/ref/abc`,
      hostnameId: refHostnameId,
    })

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'url' && m.predicate === 'related',
    )!

    const error = await upsertEntityRelation(user!, metadata, post, [
      { id: okUrlId },
      { id: refUrlId },
    ]).catch(e => e)
    expect(error.status).toBe(422)
    expect(error.message).toMatch(/referral/i)

    const okRows = (await getEntityRelation(
      'relation__post__related__url',
      post.id,
      okUrlId,
    )) as Array<{ deleted_at: Date | null }>
    expect(okRows.length).toBe(0)
  }, 60_000)

  it('upsertEntityRelation succeeds when URL hostname is unrelated to any referral program', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: user! })
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `er-non-ref-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://er-non-ref-${random}.example.com/article`,
      hostnameId,
    })

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'url' && m.predicate === 'related',
    )!

    const relations = await upsertEntityRelation(user!, metadata, post, [{ id: urlId }])
    expect(relations.length).toBe(1)
    expect(relations[0].object_id).toBe(urlId)
  }, 60_000)

  it('upsertEntityRelation allows referral-program URL for non-related predicates (e.g. user->save->url)', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 10)
    const fixture = await createReferralProgramFixture({
      createdById: user!.id,
      randomSuffix: random,
      hostname: `er-ref-save-${random}.example.com`,
      pathname: '/ref/%',
    })
    const hostnameId = await insertTestUrlHostname({ hostname: fixture.hostname })
    const urlId = await insertTestUrl({
      url: `https://${fixture.hostname}/ref/bookmark`,
      hostnameId,
    })

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'user' && m.object_type === 'url' && m.predicate === 'save',
    )!

    const relations = await upsertEntityRelation(user!, metadata, user!, [{ id: urlId }])
    expect(relations.length).toBe(1)
    expect(relations[0].object_id).toBe(urlId)
  }, 60_000)
})
