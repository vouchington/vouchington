import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'

describe('GET /api/v1/posts/:idOrSlug/ancestors query profile', () => {
  it('reads the thread root in the ancestor batch', async () => {
    const creator = await createTestUser()
    const suffix = crypto.randomUUID()
    const rootId = await insertTestPost({
      title: 'Ancestor profile root',
      slug: `ancestor-profile-root-${suffix}`,
      createdById: creator.id,
      markdown: 'Root content',
    })
    const commentId = await insertTestPost({
      title: '',
      slug: `ancestor-profile-comment-${suffix}`,
      createdById: creator.id,
      markdown: 'Leaf comment',
      postType: 'comment',
      rootId,
      parentId: rootId,
    })
    const request = createRequest()
    await request.authenticateAs(creator)
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.stubEnv('VITEST_DIAGNOSTICS', '1')
    try {
      const response = await request.get(`/api/v1/posts/${commentId}/ancestors`).expect(200)
      expect(response.body.results.map((result: { id: string }) => result.id)).toEqual([
        rootId,
        commentId,
      ])
      const profileLines = stderr.mock.calls
        .map(([chunk]) => String(chunk))
        .filter(line => line.startsWith('[pg-request-profile]'))
      expect(profileLines).toHaveLength(1)
      expect(profileLines[0]).toContain('queries=10 serialDepth=7')
    } finally {
      stderr.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
