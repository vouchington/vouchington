import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTopicClaims } from '@/lib/api/server'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { TopicClaimFlow } from '@/components/topic-claims/topic-claim-flow'
import { topicClaimHref } from '@/lib/links/entity-href'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Claim Topic')

interface Props {
  params: Promise<{ topicId: string }>
}

export default async function ClaimTopicPage({ params }: Props) {
  const t = await getTranslations()
  const { topicId } = await params
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect(`/login?next=/topic-claims/${topicId}`)

  const existingClaims = await getTopicClaims(topicId).catch(() => ({ claims: [] }))
  const existingClaim = existingClaims.claims.find(c => !c.rejected_at && !c.revoked_at)

  return (
    <>
      <Breadcrumbs
        items={buildBreadcrumbsForPath(topicClaimHref(topicId), {
          isAuthenticated: true,
          tail: [{ name: 'Claim topic', path: topicClaimHref(topicId) }],
        })}
      />
      <div className='mt-4 max-w-lg space-y-6'>
        <h1 className='text-xl font-semibold'>
          {t('extracted.topicid.page.claimThisTopic_513ea018')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.topicid.page.verifyYourRelationshipToThisTopic_2c72fbba')}
        </p>
        <TopicClaimFlow
          topicIdOrSlug={topicId}
          existingClaim={existingClaim}
        />
      </div>
    </>
  )
}
