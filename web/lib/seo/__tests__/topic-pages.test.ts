import { defaultTranslator as t } from '@ts-shared/ui-messages/default-translator'
import { describe, expect, it } from 'vitest'
import {
  computeRatingStats,
  createTopicSectionMetadata,
  createTopicSectionStructuredData,
} from '../topic-pages'
import { createNoIndexMetadata } from '../metadata'
import type { Topic } from '@/types/topics'

const topic: Topic = {
  __entity_type: 'topic',
  id: 'topic-1',
  name: 'American Express Gold',
  slug: 'amex-gold',
  markdown: 'A rewards card.',
  aliases: [],
  topic_type: 'card',
  noindex: false,
  allow_reviews: true,
  created_at: '2026-03-01T00:00:00.000Z',
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: {
    id: 'user-1',
    display_name: 'Test User',
    display_name_url_id: null,
  },
  updated_by: {
    id: 'user-1',
    display_name: 'Test User',
    display_name_url_id: null,
  },
}

describe('topic page seo helpers', () => {
  it('builds section breadcrumbs with topic and section paths', () => {
    const data = createTopicSectionStructuredData(t, topic, 'card', {
      label: 'Reviews',
      path: 'reviews',
    })

    // topic-pages.ts always passes isAuthenticated: false (anonymous/crawler context).
    // buildBreadcrumbs with intent: 'topics' prepends [Home, Topics] for anonymous users.
    expect(data.breadcrumbs).toMatchObject({
      itemListElement: [
        { position: 1, name: 'Home', item: 'https://voucha.ai/' },
        { position: 2, name: 'Topics', item: 'https://voucha.ai/topics' },
        { position: 3, name: 'American Express Gold', item: 'https://voucha.ai/card/amex-gold' },
        { position: 4, name: 'Reviews', item: 'https://voucha.ai/card/amex-gold/reviews' },
      ],
    })
  })
})

describe('createTopicSectionMetadata', () => {
  const section = { label: 'Posts', path: 'posts' }

  it('emits noindex metadata for a noindex topic on every section page', () => {
    const result = createTopicSectionMetadata({ ...topic, noindex: true }, 'card', section)
    // Literal shape createNoIndexMetadata() produces (see web/lib/seo/metadata.ts) — asserted
    // directly rather than by re-invoking the production helper.
    expect(result).toEqual({
      metadataBase: new URL('https://voucha.ai'),
      description:
        'Voucha is a social trust network — news, reviews, and recommendations from the people and sources you actually trust.',
      robots: {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
        },
      },
    })
  })

  it('emits indexable section metadata when the topic is not noindex', () => {
    const result = createTopicSectionMetadata(topic, 'card', section)
    expect(result).not.toEqual(createNoIndexMetadata())
    expect(result.title).toContain('Posts')
  })
})

describe('computeRatingStats', () => {
  it('rounds ratingValue to 1 decimal place for repeating decimals', () => {
    // 1+2+3+4+5 = 15 upvotes across 5 ratings → average = 15/5 = 3.0 (clean)
    // Use a distribution that produces a repeating decimal: 1+1+2 = 4 across 3 → 1.333...
    const { ratingValue } = computeRatingStats({
      __entity_type: 'topic_metrics',
      id: 'metrics-1',
      ratings: { count: { '1': 2, '2': 1, '3': 0, '4': 0, '5': 0 } },
    } as any)

    // 2×1 + 1×2 = 4 / 3 = 1.333... → rounded to 1.3
    expect(ratingValue).toBe(1.3)
  })

  it('returns 0 ratingValue when ratingCount is 0', () => {
    const { ratingValue, ratingCount } = computeRatingStats(null)
    expect(ratingValue).toBe(0)
    expect(ratingCount).toBe(0)
  })
})
