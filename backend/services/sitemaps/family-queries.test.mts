import { describe, expect, it } from 'vitest'
import { buildSitemapFamilyQuery, iterateSitemapFamilyEntries } from './family-queries.mts'

describe('sitemap family queries', () => {
  it('creates async iterables for family entries', () => {
    expect(iterateSitemapFamilyEntries('topics')[Symbol.asyncIterator]).toBeTypeOf('function')
  })

  it('excludes deleted and actively suspended users', () => {
    const query = buildSitemapFamilyQuery('users').text

    expect(query).toContain('FROM users')
    expect(query).toContain('deleted_at IS NULL')
    expect(query).toContain('username IS NOT NULL')
    expect(query).toContain('FROM user_suspensions')
    expect(query).toContain('lifted_at IS NULL')
  })

  it('emits indexable topic subpages without discussions', () => {
    const query = buildSitemapFamilyQuery('topics').text

    expect(query).toContain("'posts' AS subpage")
    expect(query).toContain("'data-points' AS subpage")
    expect(query).toContain("'latest' AS subpage")
    expect(query).toContain("'news' AS subpage")
    expect(query).toContain("'reviews' AS subpage")
    expect(query).toContain("'referral-links' AS subpage")
    expect(query).not.toContain("'discussions' AS subpage")
    expect(query).toContain('updated_at')
    expect(query).not.toContain('created_at AS updated_at')
    expect(query).toContain('allow_reviews IS TRUE')
    expect(query).toContain("topic_type = 'referral_program' OR referral_program_id IS NOT NULL")
  })

  it('requires public community visibility', () => {
    const query = buildSitemapFamilyQuery('communities').text

    expect(query).toContain("visibility = 'public'")
    expect(query).toContain('deleted_at IS NULL')
  })

  it('requires voted, unblocked domains', () => {
    const query = buildSitemapFamilyQuery('domains').text

    expect(query).toContain('FROM url_hostnames')
    expect(query).toContain('updated_at')
    expect(query).not.toContain('uuid_extract_timestamp(id) AS updated_at')
    expect(query).toContain('blocked IS NOT TRUE')
    expect(query).toContain('votes_count_up > 0')
  })

  it('requires landing pages to have a public item for an eligible owner', () => {
    const query = buildSitemapFamilyQuery('landing-pages').text

    expect(query).toContain("WHEN ulp.is_default THEN CONCAT('/@', u.username)")
    expect(query).toContain('GREATEST(')
    expect(query).toContain('u.updated_at')
    expect(query).toContain('MAX(ulpi_lastmod.updated_at)')
    expect(query).toContain('MAX(ulpgm_lastmod.updated_at)')
    expect(query).toContain('MAX(upl_lastmod.updated_at)')
    expect(query).toContain('MAX(review_lastmod.updated_at)')
    expect(query).toContain('MAX(group_review_lastmod.updated_at)')
    expect(query).toContain('review_lastmod_eligibility.post_id = review_lastmod.id')
    expect(query).toContain('group_review_lastmod_eligibility.post_id = group_review_lastmod.id')
    expect(query).toContain('MAX(referral_lastmod.updated_at)')
    expect(query).toContain('MAX(group_referral_lastmod.updated_at)')
    expect(query).toContain('FROM user_landing_page_items')
    expect(query).toContain("ulpi.item_type = 'profile_link'")
    expect(query).toContain(
      "upl.link_type = 'url' AND profile_url.url IS NOT NULL AND profile_url.url <> ''",
    )
    expect(query).toContain(
      "upl.link_type <> 'url' AND upl.handle IS NOT NULL AND upl.handle <> ''",
    )
    expect(query).toContain("ulpi.item_type = 'review'")
    expect(query).toContain("ulpi.item_type = 'referral_link'")
    expect(query).toContain("ulpi.item_type = 'topic_group'")
    expect(query).toContain('group_topic.deleted_at IS NULL')
    expect(query).toContain('root_post.privacy = ')
    expect(query).toContain('root_post.broadcast = ')
    expect(query).toContain('group_review_root.privacy = ')
    expect(query).toContain('urpl.activated_at IS NOT NULL')
    expect(query).toContain('urpl.deactivated_at IS NULL')
  })
})
