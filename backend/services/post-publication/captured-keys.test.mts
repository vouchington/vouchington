import { describe, expect, it } from 'vitest'
import {
  hashCapturedPublicationKeys,
  splitCapturedPublicationKeys,
  type PublicationCapturedKey,
} from './captured-keys.mts'
import { getPostPublicationWorkLimit } from './work-limits.mts'

describe('captured publication key hash', () => {
  it('is stable across source order and duplicate keys, but changes with a different old identity', () => {
    const first: PublicationCapturedKey = { kind: 'identity_post_slug', textValue: 'old-slug' }
    const second: PublicationCapturedKey = { kind: 'impact_topic', uuidValue: crypto.randomUUID() }
    expect(hashCapturedPublicationKeys([first, second, first])).toBe(
      hashCapturedPublicationKeys([second, first]),
    )
    expect(hashCapturedPublicationKeys([first, second])).not.toBe(
      hashCapturedPublicationKeys([{ kind: 'identity_post_slug', textValue: 'new-slug' }, second]),
    )
  })

  it('splits a large preimage at the configured Glide payload limit', () => {
    const limit = Math.min(
      getPostPublicationWorkLimit('effect_payload_key_batch_size'),
      getPostPublicationWorkLimit('capture_batch_size'),
    )
    const keys: PublicationCapturedKey[] = Array.from({ length: limit + 1 }, (_, index) => ({
      kind: 'identity_post_slug',
      textValue: `old-slug-${index}`,
    }))
    const pages = splitCapturedPublicationKeys(keys)
    expect(pages.map(page => page.length)).toEqual([limit, 1])
    expect(new Set(pages.flatMap(page => page.map(key => JSON.stringify(key)))).size).toBe(
      limit + 1,
    )
  })
})
