import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as fixtures from '../entities/entity-fixtures'
import * as recFixtures from '../entities/topics-story-recommendations'

const storyModuleFiles = readdirSync('web/storybook/entities')
  .filter(file => file.endsWith('.stories.ts') || file.endsWith('.stories.tsx'))
  .toSorted()
const storyFiles = storyModuleFiles.map(file => `web/storybook/entities/${file}`)

const requiredEntitySurfaces = ['ListPage', 'ListForm', 'MainPageContent', 'Asides']
const entityStoryFiles = [
  'communities.stories.tsx',
  'domains.stories.tsx',
  'landing-pages.stories.tsx',
  'news.stories.tsx',
  'posts.stories.tsx',
  'sources.stories.tsx',
  'topics.stories.tsx',
  'urls.stories.tsx',
  'users.stories.tsx',
]

const forbiddenImports = [
  '/web/app/',
  '@/app/',
  '@/lib/api/server',
  '@/lib/auth/get-current-user',
  'SidebarProvider',
  'entity-showcase',
]

describe('entity Storybook coverage', () => {
  it('defines real stories for every public entity surface', () => {
    // Auxiliary entity stories are auto-discovered by the readdirSync directory scan above;
    // only the core entity surfaces are an explicit contract, so we assert each still exists.
    const missingCore = entityStoryFiles.filter(file => !storyModuleFiles.includes(file))
    expect(missingCore).toEqual([])

    const missingSurfaces: Array<{ file: string; surface: string }> = []
    for (const file of entityStoryFiles) {
      const source = readFileSync(`web/storybook/entities/${file}`, 'utf8')
      for (const surface of requiredEntitySurfaces) {
        if (!source.includes(`export const ${surface}`)) missingSurfaces.push({ file, surface })
      }
    }
    expect(missingSurfaces).toEqual([])
  })

  it('keeps stories client-fixture driven instead of mounting app routes or server calls', () => {
    const offenders = storyFiles.flatMap(file => {
      const source = readFileSync(file, 'utf8')
      return forbiddenImports.flatMap(forbidden =>
        source.includes(forbidden) ? [{ file, forbidden }] : [],
      )
    })

    expect(offenders).toEqual([])
  })

  it('uses production components instead of the placeholder showcase', () => {
    const imports = storyFiles.map(file => readFileSync(file, 'utf8')).join('\n')

    expect(imports).toContain('@/components/posts/post-list')
    expect(imports).toContain('@/components/topics/topic-list')
    expect(imports).toContain('@/components/users/user-list')
    expect(imports).toContain('@/components/feed/news-item-list')
    expect(imports).toContain('@/components/sources/rss-feed-list-item')
    expect(imports).toContain('@/components/domains/domain-trust-badge')
    expect(imports).toContain('@/components/urls/url-list-page')
    expect(imports).toContain('@/components/landing-pages/public-landing-page')
    expect(imports).toContain('@/components/communities/community-list')
  })

  it('keeps shared fixtures populated for list, form, content, and aside variants', () => {
    expect(fixtures.topics).toHaveLength(12)
    expect(fixtures.posts).toHaveLength(7)
    expect(fixtures.publicUsers).toHaveLength(3)
    expect(fixtures.hostnames).toHaveLength(4)
    expect(fixtures.newsItems).toHaveLength(4)
    expect(fixtures.rssFeeds).toHaveLength(4)
    expect(fixtures.landingPageCandidates.reviews.length).toBeGreaterThan(0)
    expect(fixtures.landingPageWithItems.items).toHaveLength(5)
    expect(fixtures.publicLandingPage.landing_page.items).toHaveLength(5)
    expect(fixtures.userMetrics.count.reviews).toBeGreaterThan(0)
    expect(fixtures.communities).toHaveLength(2)
    expect(recFixtures.recommendationPost.topic_recommendation.status).toBe('pending')
    expect(recFixtures.approvedRecommendationPost.topic_recommendation.status).toBe('approved')
    expect(recFixtures.rejectedRecommendationPost.topic_recommendation.status).toBe('rejected')
    expect(recFixtures.recommendationsMultiStatusResponse.results).toHaveLength(3)
  })
})
