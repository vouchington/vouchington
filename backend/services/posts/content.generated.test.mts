import { describe, expect, it } from 'vitest'
import { sha256 } from '@modules/utils'
import type { Post } from './types.mts'
import { createPostTextEmbeddingContent } from './content.mts'

describe('createPostTextEmbeddingContent', () => {
  it('includes nested topic recommendation fields in embedding content', () => {
    const post = {
      title: 'Recommendation rationale',
      markdown: 'This topic should exist.',
      topic_recommendation: {
        topic_title: 'Nested Topic',
        topic_slug: 'nested-topic',
        topic_markdown: 'Nested topic markdown',
        aliases: ['nested alias'],
        hostname_id: 'hostname-id',
        hostname: { __entity_type: 'hostname', id: 'hostname-id', hostname: 'example.com' },
        hostnames: [{ __entity_type: 'hostname', id: 'hostname-id', hostname: 'example.com' }],
      },
    } as Post

    const result = createPostTextEmbeddingContent(post)

    expect(result.content).toContain('Recommendation rationale')
    expect(result.content).toContain('This topic should exist.')
    expect(result.content).toContain('Recommended topic title: Nested Topic')
    expect(result.content).toContain('Recommended topic slug: nested-topic')
    expect(result.content).toContain('Recommended topic markdown:\nNested topic markdown')
    expect(result.content).toContain('Recommended topic aliases: nested alias')
    expect(result.content).toContain('Recommended primary hostname: example.com')
    expect(result.content).toContain('Recommended hostnames:\nexample.com')
    expect(result.content_sha256).toStrictEqual(sha256(result.content))
  })

  it('includes flat topic recommendation fields in embedding content', () => {
    const result = createPostTextEmbeddingContent({
      post_type: 'topic_recommendation',
      title: 'Flat recommendation rationale',
      markdown: 'This is a flat update payload.',
      topic_title: 'Flat Topic',
      topic_slug: 'flat-topic',
      topic_markdown: 'Flat topic markdown',
      topic_hostname: 'example.com',
      topic_hostnames: ['example.com'],
      topic_aliases: ['flat alias'],
    })

    expect(result.content).toContain('Flat recommendation rationale')
    expect(result.content).toContain('This is a flat update payload.')
    expect(result.content).toContain('Recommended topic title: Flat Topic')
    expect(result.content).toContain('Recommended topic slug: flat-topic')
    expect(result.content).toContain('Recommended topic markdown:\nFlat topic markdown')
    expect(result.content).toContain('Recommended topic aliases: flat alias')
    expect(result.content).toContain('Recommended primary hostname: example.com')
    expect(result.content).toContain('Recommended hostnames:\nexample.com')
    expect(result.content_sha256).toStrictEqual(sha256(result.content))
  })
})
