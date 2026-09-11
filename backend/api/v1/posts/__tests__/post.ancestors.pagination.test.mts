import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, deleteTestPost, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('post.ancestors pagination', () => {
  let creator: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser({ administrator: true })
  })

  async function createCommentChain(depth: number) {
    const rootId = await insertTestPost({
      title: 'Ancestor pagination root',
      slug: `ancestor-page-root-${Date.now()}-${Math.random()}`,
      createdById: creator.id,
      markdown: 'Root content',
    })
    const ids: string[] = []
    let parentId = rootId
    for (let index = 0; index < depth; index++) {
      const id = await insertTestPost({
        title: '',
        slug: `ancestor-page-${index}-${Date.now()}-${Math.random()}`,
        createdById: creator.id,
        markdown: `Comment ${index}`,
        postType: 'comment',
        rootId,
        parentId,
      })
      ids.push(id)
      parentId = id
    }
    return { ids, rootId }
  }

  it('returns an opt-in bounded initial window with a pinned root and continuation cursor', async () => {
    const { ids, rootId } = await createCommentChain(8)
    const response = await createRequest()
      .get(`/api/v1/posts/${ids.at(-1)!}/ancestors?limit=5`)
      .expect(200)

    const resultIds = response.body.results.map((result: { id: string }) => result.id)
    expect(resultIds).toEqual([rootId, ...ids.slice(-6)])
    expect(Object.keys(response.body.posts)).toEqual(expect.arrayContaining(resultIds))
    expect(Object.keys(response.body.posts)).toHaveLength(resultIds.length)
    expect(response.body.page_info).toMatchObject({
      has_next_page: true,
      start_cursor: expect.any(String),
      end_cursor: expect.any(String),
    })
  })

  it('continues rootward without duplicate comments while retaining the pinned root', async () => {
    const { ids, rootId } = await createCommentChain(8)
    const request = createRequest()
    const first = await request.get(`/api/v1/posts/${ids.at(-1)!}/ancestors?limit=5`).expect(200)
    const second = await request
      .get(
        `/api/v1/posts/${ids.at(-1)!}/ancestors?limit=5&after=${encodeURIComponent(first.body.page_info.end_cursor as string)}`,
      )
      .expect(200)

    expect(second.body.results.map((result: { id: string }) => result.id)).toEqual([
      rootId,
      ...ids.slice(0, 2),
    ])
    expect(second.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(Object.keys(second.body.posts).sort()).toEqual(
      second.body.results.map((result: { id: string }) => result.id).sort(),
    )
    expect([
      first.body.results[0].id,
      ...second.body.results.slice(1).map((result: { id: string }) => result.id),
      ...first.body.results.slice(1).map((result: { id: string }) => result.id),
    ]).toEqual([rootId, ...ids])
  })

  it('preserves deleted structural ancestors across bounded pages', async () => {
    const { ids, rootId } = await createCommentChain(8)
    await Promise.all([deleteTestPost(ids[1]!), deleteTestPost(ids[4]!)])

    const first = await createRequest()
      .get(`/api/v1/posts/${ids.at(-1)!}/ancestors?limit=5`)
      .expect(200)
    const second = await createRequest()
      .get(
        `/api/v1/posts/${ids.at(-1)!}/ancestors?limit=5&after=${encodeURIComponent(first.body.page_info.end_cursor as string)}`,
      )
      .expect(200)

    expect(first.body.results.map((result: { id: string }) => result.id)).toContain(ids[4])
    expect(second.body.results.map((result: { id: string }) => result.id)).toContain(ids[1])
    expect(first.body.posts[ids[4]!]).toBeUndefined()
    expect(second.body.posts[ids[1]!]).toBeUndefined()
    expect(second.body.results[0].id).toBe(rootId)
  })

  it('defaults an after-only request to five rootward ancestors', async () => {
    const { ids, rootId } = await createCommentChain(12)
    const first = await createRequest()
      .get(`/api/v1/posts/${ids.at(-1)!}/ancestors?limit=5`)
      .expect(200)
    const second = await createRequest()
      .get(
        `/api/v1/posts/${ids.at(-1)!}/ancestors?after=${encodeURIComponent(first.body.page_info.end_cursor as string)}`,
      )
      .expect(200)

    expect(second.body.results).toHaveLength(6)
    expect(second.body.results[0].id).toBe(rootId)
    expect(second.body.page_info.has_next_page).toBe(true)
  })

  it('supports a one-hop page and caps larger limits at five', async () => {
    const { ids, rootId } = await createCommentChain(8)
    const response = await createRequest()
      .get(`/api/v1/posts/${ids.at(-1)!}/ancestors?limit=1`)
      .expect(200)

    expect(response.body.results.map((result: { id: string }) => result.id)).toEqual([
      rootId,
      ...ids.slice(-2),
    ])
    const capped = await createRequest()
      .get(`/api/v1/posts/${ids.at(-1)!}/ancestors?limit=6`)
      .expect(200)
    expect(capped.body.results.map((result: { id: string }) => result.id)).toEqual([
      rootId,
      ...ids.slice(-6),
    ])
  })

  it('does not offer a continuation when exactly five comment parents fit beside the target', async () => {
    const { ids, rootId } = await createCommentChain(6)
    const response = await createRequest()
      .get(`/api/v1/posts/${ids.at(-1)!}/ancestors?limit=5`)
      .expect(200)

    expect(response.body.results.map((result: { id: string }) => result.id)).toEqual([
      rootId,
      ...ids,
    ])
    expect(response.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })

  it('rejects a tampered or cross-target continuation cursor', async () => {
    const firstChain = await createCommentChain(8)
    const secondChain = await createCommentChain(1)
    const first = await createRequest()
      .get(`/api/v1/posts/${firstChain.ids.at(-1)!}/ancestors?limit=5`)
      .expect(200)
    const cursor = first.body.page_info.end_cursor as string
    const tampered = `${cursor.slice(0, -1)}x`

    await createRequest()
      .get(`/api/v1/posts/${firstChain.ids.at(-1)!}/ancestors?limit=5&after=${tampered}`)
      .expect(400)
    await createRequest()
      .get(
        `/api/v1/posts/${secondChain.ids.at(-1)!}/ancestors?limit=5&after=${encodeURIComponent(cursor)}`,
      )
      .expect(400)
    await createRequest()
      .get(
        `/api/v1/posts/${firstChain.ids.at(-1)!}/ancestors?limit=5&after=${encodeURIComponent(first.body.page_info.start_cursor as string)}`,
      )
      .expect(400)
  })

  it('rechecks target access before serving a continuation window', async () => {
    const { ids } = await createCommentChain(8)
    const targetId = ids.at(-1)!
    const first = await createRequest()
      .get(`/api/v1/posts/${targetId}/ancestors?limit=5`)
      .expect(200)
    await deleteTestPost(targetId)

    await createRequest()
      .get(
        `/api/v1/posts/${targetId}/ancestors?limit=5&after=${encodeURIComponent(first.body.page_info.end_cursor as string)}`,
      )
      .expect(404)
  })

  it('keeps comment creation unlimited when the parent chain is already deeper than five', async () => {
    const { ids } = await createCommentChain(8)
    const request = createRequest()
    await request.authenticateAs(creator)

    const response = await request
      .post('/api/v1/posts')
      .send({
        post_type: 'comment',
        parent_id: ids.at(-1),
        markdown: 'A reply beyond the viewing window',
        cf_turnstile_response: 'test-bypass',
      })
      .expect(201)

    expect(response.body.post.parent_id).toBe(ids.at(-1))
  })

  it('keeps no-query ancestor requests on the legacy full-chain response during expansion', async () => {
    const { ids, rootId } = await createCommentChain(8)
    const response = await createRequest()
      .get(`/api/v1/posts/${ids.at(-1)!}/ancestors`)
      .expect(200)

    expect(response.body.results.map((result: { id: string }) => result.id)).toEqual([
      rootId,
      ...ids,
    ])
    expect(response.body.page_info).toEqual({
      has_next_page: false,
      end_cursor: null,
      start_cursor: null,
    })
  })
})
