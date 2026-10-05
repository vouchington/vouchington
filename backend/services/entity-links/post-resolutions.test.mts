import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseEntityMentions } from './index.mts'
import { buildResolvedPostMention } from './post-resolutions.mts'

describe('buildResolvedPostMention', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    '!/review/root-review/comment/019c64e6-f720-7001-a001-000000000010',
    '!https://voucha.ai/review/root-review/comment/019c64e6-f720-7001-a001-000000000010',
  ])('preserves the original route when a comment root is unavailable: %s', raw => {
    vi.stubEnv('SITEMAP_BASE_URL', 'https://voucha.ai')
    const [mention] = parseEntityMentions(raw)
    expect(mention).toMatchObject({ type: 'post', source: 'comment_url' })
    if (mention?.type !== 'post') throw new Error('Expected a parsed post mention')

    const resolved = buildResolvedPostMention(
      mention,
      {
        id: mention.identifier,
        post_type: 'comment',
        root_post_id: 'unavailable-root',
      },
      new Map(),
    )

    expect(resolved).toMatchObject({
      url: `/review/unavailable-root/comment/${mention.identifier}`,
      displayText: raw,
      displayTitle: raw,
    })
  })
})
