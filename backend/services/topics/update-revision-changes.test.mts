import { it, expect, describe } from 'vitest'
import { buildTopicRevisionChanges } from './update-revision-changes.mts'
import type { Topic } from './types.mts'

const baseTopic = {
  id: '0192f000-0000-7000-8000-000000000000',
  name: 'Topic',
  slug: 'topic',
  markdown: '',
  topic_type: 'topic',
  noindex: false,
  allow_reviews: true,
  logo_image_id: null,
  hero_image_id: null,
  homepage_url_id: null,
  hostname_id: null,
  rewards_program_id: null,
  referral_program_id: null,
} as unknown as Topic

describe('buildTopicRevisionChanges', () => {
  it('records noindex and allow_reviews flag changes', () => {
    const changes = buildTopicRevisionChanges(
      baseTopic,
      { noindex: true, allow_reviews: false },
      undefined,
    )
    expect(changes.noindex).toEqual({ before: false, after: true })
    expect(changes.allow_reviews).toEqual({ before: true, after: false })
  })

  it('omits flags when unchanged', () => {
    const changes = buildTopicRevisionChanges(
      baseTopic,
      { noindex: false, allow_reviews: true },
      undefined,
    )
    expect(changes.noindex).toBeUndefined()
    expect(changes.allow_reviews).toBeUndefined()
  })

  it('returns an empty diff when nothing changed', () => {
    expect(buildTopicRevisionChanges(baseTopic, {}, undefined)).toEqual({})
  })

  it('records core, image, url, hostname, and program reference changes', () => {
    const changes = buildTopicRevisionChanges(
      baseTopic,
      {
        name: 'New Name',
        slug: 'new-slug',
        topic_type: 'card',
        markdown: 'new md',
        logo_image_id: 'logo-1',
        hero_image_id: 'hero-1',
        homepage_url_id: 'url-1',
        rewards_program_id: 'rp-1',
        referral_program_id: 'ref-1',
      },
      'host-1',
    )
    expect(changes.name).toEqual({ before: 'Topic', after: 'New Name' })
    expect(changes.slug).toEqual({ before: 'topic', after: 'new-slug' })
    expect(changes.topic_type).toEqual({ before: 'topic', after: 'card' })
    expect(changes.markdown).toEqual({ before: '', after: 'new md' })
    expect(changes.logo_image_id).toEqual({ before: null, after: 'logo-1' })
    expect(changes.hero_image_id).toEqual({ before: null, after: 'hero-1' })
    expect(changes.homepage_url_id).toEqual({ before: null, after: 'url-1' })
    expect(changes.hostname_id).toEqual({ before: null, after: 'host-1' })
    expect(changes.rewards_program_id).toEqual({ before: null, after: 'rp-1' })
    expect(changes.referral_program_id).toEqual({ before: null, after: 'ref-1' })
  })
})
