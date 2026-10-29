// Every id-looking dynamic segment under web/app must be listed here with the reason its entity has
// no unique natural key to route by (see docs/development/web-agent-rules.md#identifiers).
// Keys are route patterns up to and including the segment, with route groups removed.
const SLUG_OR_ID =
  'slug-first param (the name is legacy); the id is only the fallback for a missing slug'
const COMMENT = 'comments have no slug or natural key; scoped under their post'
const CRAWL = 'crawl records have no natural key'
const MODMAIL = 'modmail threads have no natural key'

const postTypes = [
  'article',
  'blog-post',
  'data-point',
  'discussion',
  'link',
  'review',
  'story',
] as const
const topicTypes = [
  'bank-account',
  'card',
  'domain',
  'instance',
  'referral-program',
  'rewards-program-status',
  'rewards-program',
  'source',
  'topic',
] as const

const entries: Array<[route: string, reason: string]> = [
  ['/crawler/[id]', 'crawler configs have no natural key'],
  ['/list/[id]', 'lists have no natural key'],
  ['/messages/[conversationId]', 'conversations have no natural key'],
  ['/messages/modmail/[communitySlug]/[threadId]', MODMAIL],
  ['/communities/[slug]/settings/moderation/modmail/[threadId]', MODMAIL],
  ['/copyright/notices/[id]', 'copyright notices have no natural key'],
  ['/source/[id]/crawls/[crawlId]', CRAWL],
  ['/url/[urlValue]/crawls/[crawlId]', CRAWL],
  [
    '/referral-program/[id]/validations/[validationId]',
    'referral validations have no natural key; scoped under their program',
  ],
  ['/admin/landing-pages/[pageId]', 'landing pages have no natural key; staff-only route'],
]
for (const type of postTypes) {
  entries.push([`/${type}/[id]`, SLUG_OR_ID], [`/${type}/[id]/comment/[commentId]`, COMMENT])
}
for (const type of topicTypes) entries.push([`/${type}/[id]`, SLUG_OR_ID])

export const webIdRouteSegmentAllowlist: ReadonlyMap<string, string> = new Map(entries)
