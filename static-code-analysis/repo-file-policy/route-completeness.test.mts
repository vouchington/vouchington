import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assert, describe, it } from 'vitest'

// Slugs derived from topicTypes in web/types/topics.ts — update both when adding a topic type
const TOPIC_SLUGS = [
  'bank-account',
  'card',
  'instance',
  'referral-program',
  'rewards-program',
  'rewards-program-status',
  'source',
  'topic',
] as const

const TOPIC_SUBPAGES = [
  'page.tsx',
  'layout.tsx',
  'data-points/page.tsx',
  'discussions/page.ts', // .ts, not .tsx — no JSX in this redirect stub
  'latest/page.tsx',
  'news/page.tsx',
  'posts/page.tsx',
  'referral-links/page.tsx',
  'reviews/page.tsx',
  'settings/page.tsx',
  'settings/about/page.tsx',
  'settings/aliases/page.tsx',
  'settings/behavior/page.tsx',
  'settings/domains/page.tsx',
  'settings/merge/page.tsx',
  'settings/source/page.tsx',
  'tags/[objectType]/page.tsx',
] as const

// Routable post types — excludes non-route internal types (comment, topic_recommendation)
const POST_SLUGS = ['article', 'blog-post', 'data-point', 'discussion', 'review', 'story'] as const

const POST_SUBPAGES = [
  '[id]/page.tsx',
  '[id]/comment/[commentId]/page.tsx',
  '[id]/tags/[objectType]/page.tsx',
] as const

// story has no edit page
const POST_SLUGS_WITH_EDIT = POST_SLUGS.filter(s => s !== 'story')

const WEB_APP = join(process.cwd(), 'web/app')

describe.each(TOPIC_SLUGS)('(topics)/%s route completeness', slug => {
  it.each(TOPIC_SUBPAGES)('[id]/%s exists', subpage => {
    const path = join(WEB_APP, '(topics)', slug, '[id]', subpage)
    assert(existsSync(path), `missing: web/app/(topics)/${slug}/[id]/${subpage}`)
  })
})

describe.each(POST_SLUGS)('(posts)/%s route completeness', slug => {
  it.each(POST_SUBPAGES)('%s exists', subpage => {
    const path = join(WEB_APP, '(posts)', slug, subpage)
    assert(existsSync(path), `missing: web/app/(posts)/${slug}/${subpage}`)
  })
})

describe('(posts) edit page completeness', () => {
  it.each(POST_SLUGS_WITH_EDIT)('%s/[id]/edit/page.tsx exists', slug => {
    const path = join(WEB_APP, '(posts)', slug, '[id]/edit/page.tsx')
    assert(existsSync(path), `missing: web/app/(posts)/${slug}/[id]/edit/page.tsx`)
  })
})

// Excludes layout.tsx (not a page), discussions/page.ts and tags/[objectType]/page.tsx
// (use static `export const metadata` instead of a generateMetadata function)
const TOPIC_SUBPAGES_WITH_GENERATE_METADATA = [
  'page.tsx',
  'data-points/page.tsx',
  'latest/page.tsx',
  'news/page.tsx',
  'posts/page.tsx',
  'referral-links/page.tsx',
  'reviews/page.tsx',
  'settings/page.tsx',
  'settings/about/page.tsx',
  'settings/aliases/page.tsx',
  'settings/behavior/page.tsx',
  'settings/domains/page.tsx',
  'settings/merge/page.tsx',
  'settings/source/page.tsx',
] as const

const REFERRAL_PROGRAM_ADMIN_SUBPAGES = [
  'settings/validations/page.tsx',
  'validations/page.tsx',
  'validations/new/page.tsx',
  'validations/[validationId]/page.tsx',
] as const

describe.each(TOPIC_SLUGS)('(topics)/%s generateMetadata exports', slug => {
  it.each(TOPIC_SUBPAGES_WITH_GENERATE_METADATA)('[id]/%s exports generateMetadata', subpage => {
    const path = join(WEB_APP, '(topics)', slug, '[id]', subpage)
    assert(existsSync(path), `missing: web/app/(topics)/${slug}/[id]/${subpage}`)
    const content = readFileSync(path, 'utf8')
    assert(
      /\bexport\b[^\n]*\bgenerateMetadata\b/.test(content),
      `web/app/(topics)/${slug}/[id]/${subpage}: missing generateMetadata export`,
    )
  })
})

describe('(topics)/referral-program admin route completeness', () => {
  it.each(REFERRAL_PROGRAM_ADMIN_SUBPAGES)('[id]/%s exists', subpage => {
    const path = join(WEB_APP, '(topics)', 'referral-program', '[id]', subpage)
    assert(existsSync(path), `missing: web/app/(topics)/referral-program/[id]/${subpage}`)
  })

  it.each(REFERRAL_PROGRAM_ADMIN_SUBPAGES)('[id]/%s exports generateMetadata', subpage => {
    const path = join(WEB_APP, '(topics)', 'referral-program', '[id]', subpage)
    assert(existsSync(path), `missing: web/app/(topics)/referral-program/[id]/${subpage}`)
    const content = readFileSync(path, 'utf8')
    assert(
      /\bexport\b[^\n]*\bgenerateMetadata\b/.test(content),
      `web/app/(topics)/referral-program/[id]/${subpage}: missing generateMetadata export`,
    )
  })
})
