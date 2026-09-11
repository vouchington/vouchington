import { describe, expect, it } from 'vitest'
import { parseAutomodActionSourceKey } from './recent-actions-utils.mts'

describe('recent automod action source keys', () => {
  it('parses valid source keys and rejects malformed source ids or hashes', () => {
    const postId = '00000000-0000-0000-0000-000000000001'
    const moderationId = '00000000-0000-0000-0000-000000000002'
    const inputHash = 'a'.repeat(64)

    expect(parseAutomodActionSourceKey(`openai_omni:${postId}:${inputHash}`)).toMatchObject({
      sourceType: 'openai_omni',
      id: postId,
      inputSha256: Buffer.from(inputHash, 'hex'),
    })
    expect(parseAutomodActionSourceKey(`spam_detection:${postId}:${inputHash}`)).toMatchObject({
      sourceType: 'spam_detection',
      id: postId,
      inputSha256: Buffer.from(inputHash, 'hex'),
    })
    expect(parseAutomodActionSourceKey(`agent_moderation:${moderationId}`)).toEqual({
      sourceType: 'agent_moderation',
      id: moderationId,
      inputSha256: null,
    })
    expect(parseAutomodActionSourceKey(`community_prompt:${moderationId}`)).toEqual({
      sourceType: 'community_prompt',
      id: moderationId,
      inputSha256: null,
    })
    expect(parseAutomodActionSourceKey(`openai_omni:${postId}`)).toBeNull()
    expect(parseAutomodActionSourceKey(`openai_omni:${postId}:legacy-null-input`)).toBeNull()
    expect(parseAutomodActionSourceKey(`agent_moderation:${moderationId}:${inputHash}`)).toBeNull()
    expect(parseAutomodActionSourceKey(`unknown:${postId}`)).toBeNull()
    expect(parseAutomodActionSourceKey(`spam_detection:not-a-uuid:${inputHash}`)).toBeNull()
  })
})
