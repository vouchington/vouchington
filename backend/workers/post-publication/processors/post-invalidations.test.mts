import { createTestPost } from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'

import { caches } from '@services/entity-cache/caches'
import { invalidatePostStrict } from '@services/entity-cache/invalidate-strict'
import type { ReconciliationPost } from '@services/post-publication/reconcile'
import type { invalidatePostPublicSurfacesStrict } from '@services/posts/public-surfaces'
import { invalidateReconciledPostSurfaces } from './post-invalidations.mts'

describe('reconciled post invalidations', () => {
  it('invalidates comment, parent, and root metrics after a comment eligibility change', async () => {
    const root = await createTestPost()
    const parent = await createTestPost({
      parent_id: root.id,
      root_id: root.id,
      post_type: 'comment',
    })
    const comment = await createTestPost({
      parent_id: parent.id,
      root_id: root.id,
      post_type: 'comment',
    })
    const reconciledComment: ReconciliationPost = {
      id: comment.id,
      parent_id: parent.id,
      root_id: root.id,
      created_by_id: comment.created_by_id,
      community_id: comment.community_id,
      post_type: comment.post_type,
      sitemap_day: '2026-09-01',
      is_public: true,
      eligibility_fingerprint: 'comment-eligibility-change',
      projection_identity: { topicIds: [], identityKeys: [], sitemapTargets: [] },
    }
    await Promise.all(
      [root.id, parent.id, comment.id].map(id => caches.post_metrics.set(id, { stale: true })),
    )
    const invalidatePostPublicSurfaces = vi
      .fn<typeof invalidatePostPublicSurfacesStrict>()
      .mockResolvedValue(undefined)

    await invalidateReconciledPostSurfaces(
      [reconciledComment],
      [],
      [],
      invalidatePostStrict,
      invalidatePostPublicSurfaces,
    )

    await expect(caches.post_metrics.get(root.id)).resolves.toBeNull()
    await expect(caches.post_metrics.get(parent.id)).resolves.toBeNull()
    await expect(caches.post_metrics.get(comment.id)).resolves.toBeNull()
  })
})
