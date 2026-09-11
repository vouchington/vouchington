export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { PageWithAside } from '@/components/page-with-aside'
import { PageHeader } from '@/components/shared/page-header'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { isModerationStaff } from '@/lib/auth/official-account'
import { getCommunity } from '@/lib/api/server'
import { getModmailThreadServer, getModmailThreadMessagesServer } from '@/lib/api/server/modmail'
import { createCommunityPathname } from '@/lib/links/entity-href'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { ModmailThreadClient } from './modmail-thread-client'
import type { Metadata } from 'next'
import { getTranslations } from '@/lib/i18n/get-translations'

interface PageProps {
  params: Promise<{ slug: string; threadId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`Modmail Thread — ${data.community.name}`)
}

export default async function ModmailThreadPage({ params }: PageProps) {
  const t = await getTranslations()
  const { slug, threadId } = await params
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  // Load community and thread concurrently. Community may be null for non-members of
  // private communities, but subject users are still authorized by the thread endpoint.
  const [communityData, threadData, messagesData] = await Promise.all([
    getCommunity(slug),
    getModmailThreadServer(slug, threadId),
    getModmailThreadMessagesServer(slug, threadId),
  ])

  if (!threadData) notFound()

  const role =
    communityData?.membership?.removed_at == null ? communityData?.membership?.role : null
  const isMod = isModerationStaff(currentUser) || role === 'owner' || role === 'moderator'

  // Non-mods must be the subject of this thread
  if (!isMod && currentUser.id !== threadData.thread.subject_user_id) {
    notFound()
  }

  const communityName = communityData?.community.name ?? slug
  const moderationPath = createCommunityPathname(slug, '/settings/moderation')
  // intentCrumbOverride: modmail lives under /communities/:slug/settings/moderation,
  // which resolves to the communities intent — but the breadcrumb root should point
  // at the community moderation page, not the generic communities list.
  const breadcrumbItems = buildBreadcrumbsForPath(moderationPath, {
    isAuthenticated: true,
    userRoles: currentUser?.roles ?? [],
    intentCrumbOverride: { name: 'Moderation', path: moderationPath },
    tail: [{ name: 'Modmail Thread', path: '#' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex items-start justify-between gap-4'>
          <PageHeader
            title={t('extracted.threadid.page.modmailThread_a7191508')}
            description={t('extracted.threadid.page.communityCommunityname_2c7d4f10', {
              communityName,
            })}
          />
        </div>

        <ModmailThreadClient
          key={`${slug}:${threadData.thread.id}`}
          communitySlug={slug}
          thread={threadData.thread}
          initialMessages={messagesData?.results ?? []}
          initialHasMore={messagesData?.page_info.has_next_page ?? false}
          initialEndCursor={messagesData?.page_info.end_cursor ?? null}
          isMod={isMod}
        />

        <Button
          asChild
          variant='outline'
        >
          <Link
            href={moderationPath}
            prefetch={false}
            data-pw='modmail-back-link'
          >
            {t('extracted.threadid.page.backToModeration_0aa9e302')}
          </Link>
        </Button>
      </div>
    </PageWithAside>
  )
}
