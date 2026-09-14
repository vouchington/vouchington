import { permanentRedirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { getTopicsCompare } from '@/lib/api/server/topics-compare'
import { createPageMetadata } from '@/lib/seo/metadata'
import { createBreadcrumbSchema, createComparisonPageSchema } from '@/lib/seo/structured-data'
import { getSchemaOrgType } from '@/lib/seo/schema-org-types'
import { compareHref, topicHref } from '@/lib/links/entity-href'
import { ComparePage } from '@/components/compare/compare-page'
import { PageWithAside } from '@/components/page-with-aside'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slugPair: string }>
}

function parseSlugPair(slugPair: string): [string, string] | null {
  const parts = slugPair.split('-vs-')
  if (parts.length !== 2) return null
  const [a, b] = parts
  if (!a || !b) return null
  return [a, b]
}

function getCanonicalSlugPair(slugA: string, slugB: string): string {
  return slugA.localeCompare(slugB) <= 0 ? `${slugA}-vs-${slugB}` : `${slugB}-vs-${slugA}`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slugPair } = await params
  const parsed = parseSlugPair(slugPair)
  if (!parsed) return {}

  const [slugA, slugB] = parsed
  const canonical = getCanonicalSlugPair(slugA, slugB)
  if (`${slugA}-vs-${slugB}` !== canonical) return {}

  const data = await getTopicsCompare(slugA, slugB)
  if (!data) return {}

  const topicA = Object.values(data.topics).find(t => t.slug === slugA)
  const topicB = Object.values(data.topics).find(t => t.slug === slugB)
  if (!topicA || !topicB) return {}

  return createPageMetadata({
    title: `${topicA.name} vs ${topicB.name}`,
    description: `Side-by-side comparison of ${topicA.name} and ${topicB.name}. Community reviews, ratings, data points, and voting scores from real users.`,
    path: compareHref(canonical),
  })
}

export default async function CompareSlugPairPage({ params }: PageProps) {
  const { slugPair } = await params
  const parsed = parseSlugPair(slugPair)
  if (!parsed) notFound()

  const [slugA, slugB] = parsed
  const canonical = getCanonicalSlugPair(slugA, slugB)

  if (`${slugA}-vs-${slugB}` !== canonical) {
    permanentRedirect(compareHref(canonical))
  }

  const [data, currentUser, uiLocale, t] = await Promise.all([
    getTopicsCompare(slugA, slugB),
    getCurrentUser(),
    getResolvedUiLocale(),
    getTranslations(),
  ])
  if (!data) notFound()

  const topicA = Object.values(data.topics).find(t => t.slug === slugA)
  const topicB = Object.values(data.topics).find(t => t.slug === slugB)
  if (!topicA || !topicB) notFound()

  const categoriesA = data.topic_categories[topicA.id] ?? []
  const categoriesB = data.topic_categories[topicB.id] ?? []

  const canonicalPath = compareHref(canonical)
  const breadcrumbItems = buildBreadcrumbsForPath(canonicalPath, {
    isAuthenticated: !!currentUser,
    tail: [{ name: `${topicA.name} vs ${topicB.name}`, path: canonicalPath }],
  })

  const topicAPath = topicHref(topicA)
  const topicBPath = topicHref(topicB)

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
        <AnonymousStructuredDataScript
          data={createComparisonPageSchema({
            topicA: {
              name: topicA.name,
              path: topicAPath,
              schemaOrgType: getSchemaOrgType(categoriesA),
            },
            topicB: {
              name: topicB.name,
              path: topicBPath,
              schemaOrgType: getSchemaOrgType(categoriesB),
            },
            path: canonicalPath,
          })}
        />
        <Breadcrumbs items={breadcrumbItems} />
        <ComparePage
          topicA={topicA}
          topicB={topicB}
          topicAPath={topicAPath}
          topicBPath={topicBPath}
          metricsA={data.topic_metrics[topicA.id]}
          metricsB={data.topic_metrics[topicB.id]}
          electionA={data.topic_elections[topicA.id]}
          electionB={data.topic_elections[topicB.id]}
          insightsA={data.data_point_insights[topicA.id]}
          insightsB={data.data_point_insights[topicB.id]}
          uiLocale={uiLocale}
          t={t}
        />
      </div>
    </PageWithAside>
  )
}
