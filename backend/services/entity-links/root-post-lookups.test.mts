import { describe, expect, it } from 'vitest'
import { getRootPostsForCommentMentions } from './root-post-lookups.mts'
import type { PostMention } from './types.mts'

describe('getRootPostsForCommentMentions', () => {
  it('ignores root metadata after the post lookup failed', async () => {
    const mention: PostMention = {
      type: 'post',
      raw: '!comment',
      identifier: crypto.randomUUID(),
      startIndex: 0,
      endIndex: 8,
      source: 'identifier',
    }
    const comment = {
      id: mention.identifier,
      post_type: 'comment',
      root_post_id: `${crypto.randomUUID()}?`,
    }

    const result = await getRootPostsForCommentMentions(
      [mention],
      new Map([['post', new Map([[mention.identifier, comment]])]]),
      new Map([['post', true]]),
    )

    expect(result).toEqual({ failed: false, roots: new Map() })
  })

  it('returns an empty lookup when no post lookup exists', async () => {
    const mention: PostMention = {
      type: 'post',
      raw: '!comment',
      identifier: crypto.randomUUID(),
      startIndex: 0,
      endIndex: 8,
      source: 'identifier',
    }

    const result = await getRootPostsForCommentMentions([mention], new Map(), new Map())

    expect(result).toEqual({ failed: false, roots: new Map() })
  })

  it('reports a failed lookup when cached comment root metadata is invalid', async () => {
    const mention: PostMention = {
      type: 'post',
      raw: '!comment',
      identifier: crypto.randomUUID(),
      startIndex: 0,
      endIndex: 8,
      source: 'identifier',
    }
    const comment = {
      id: mention.identifier,
      post_type: 'comment',
      root_post_id: `${crypto.randomUUID()}?`,
    }

    const result = await getRootPostsForCommentMentions(
      [mention],
      new Map([['post', new Map([[mention.identifier, comment]])]]),
      new Map(),
    )

    expect(result).toEqual({ failed: true, roots: new Map() })
  })
})
