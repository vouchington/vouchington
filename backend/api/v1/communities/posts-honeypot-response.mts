import type { Context } from '@jongleberry/api-server'
import { mintUUIDv7 } from '@ts-shared/session-jwt'
import type { CreatePostInput } from '@services/posts'

export function sendCommunityPostHoneypotResponse(
  ctx: Context,
  body: CreatePostInput,
  communityId: string,
  currentUserId: string,
) {
  const now = new Date().toISOString()
  ctx.setStatus(201)
  ctx.json({
    post: {
      id: mintUUIDv7(),
      post_type: body.post_type ?? 'discussion',
      title: body.title ?? '',
      markdown: body.markdown ?? '',
      ai_summary_markdown: '',
      parent_id: null,
      root_id: null,
      community_id: communityId,
      created_by_id: currentUserId,
      broadcast: body.broadcast ?? 'everyone',
      privacy: body.privacy ?? 'public',
      is_anonymous: body.is_anonymous ?? false,
      deleted_at: null,
      deleted_by_id: null,
      archived_at: null,
      archived_by_id: null,
      updated_by_id: null,
      clearance_status: 'pending',
      clearance_updated_at: null,
      spam_detection_flagged: null,
      spam_detection_created_at: null,
      spam_detection_score: null,
      spam_detection_results: null,
      created_at: now,
      updated_at: now,
    },
  })
}
