import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getCommunity } from '@/lib/api/server'
import { communityHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('New Community Post')

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function CreateCommunityPostPage({ params }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { slug } = await params
  const communityData = await getCommunity(slug)

  if (!communityData) notFound()
  if (communityData.community.archived_at) redirect(communityHref({ slug }))

  const { community } = communityData
  const membership = communityData.membership
  const canPost = user.roles.includes('administrator') || (membership && !membership.removed_at)
  if (!canPost) redirect(communityHref(community))

  redirect(`/discussions/create?community=${encodeURIComponent(community.slug)}`)
}
