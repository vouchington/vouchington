export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import {
  getCommunity,
  getCommunityListTopics,
  getCommunityListRssFeeds,
  getCommunityListPosts,
  getCommunityListDomains,
  getCommunityListUrls,
} from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { CommunityListItemsList } from '@/components/communities/community-list-items-list'
import { AddCommunityListItemForm } from '@/components/communities/add-community-list-item-form'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'
import type { CommunityListPageData } from '@/types/api-responses'
import type { CommunityListItemType } from '@voucha/types/entities/community'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ slug: string; itemType: string }>
}

interface ItemTypeConfig {
  apiType: CommunityListItemType
  label: string
  endpoint: (slug: string) => string
}

const itemTypeConfigs: Record<string, ItemTypeConfig> = Object.fromEntries(
  Object.entries(communityListItemTypeCatalog).map(([itemType, config]) => [
    config.webPathSegment,
    buildItemTypeConfig(itemType as CommunityListItemType),
  ]),
)

function buildItemTypeConfig(apiType: CommunityListItemType): ItemTypeConfig {
  const config = communityListItemTypeCatalog[apiType]
  return {
    apiType,
    label: config.labelPlural,
    endpoint: slug => `/api/v1/communities/${slug}/list-items/${config.apiPathSegment}`,
  }
}

async function fetchListData(slug: string, itemType: string): Promise<CommunityListPageData> {
  switch (itemType) {
    case 'topics': {
      return getCommunityListTopics(slug)
    }
    case 'feeds': {
      return getCommunityListRssFeeds(slug)
    }
    case 'posts': {
      return getCommunityListPosts(slug)
    }
    case 'domains': {
      return getCommunityListDomains(slug)
    }
    case 'urls': {
      return getCommunityListUrls(slug)
    }
    default: {
      notFound()
    }
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, itemType } = await params
  const config = itemTypeConfigs[itemType]
  if (!config) return {}
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`${config.label} — ${data.community.name} List`)
}

export default async function CommunityListItemTypePage({ params }: PageProps) {
  const { slug, itemType } = await params

  const config = itemTypeConfigs[itemType]
  if (!config) {
    notFound()
  }

  const communityData = await getCommunity(slug)

  if (!communityData || communityData.has_pending_application) {
    notFound()
  }

  const [currentUser, listData] = await Promise.all([
    getCurrentUser(),
    fetchListData(slug, itemType),
  ])

  const { community, membership } = communityData
  const currentUserRole = membership?.removed_at == null ? (membership?.role ?? null) : null
  const isMod = currentUserRole === 'owner' || currentUserRole === 'moderator'

  return (
    <div className='space-y-4'>
      {isMod && currentUser && (
        <AddCommunityListItemForm
          communitySlug={community.slug}
          itemType={config.apiType}
        />
      )}
      <CommunityListItemsList
        initialData={listData}
        endpoint={config.endpoint(community.slug)}
        itemType={config.apiType}
        communitySlug={community.slug}
        canManage={isMod && !!currentUser}
      />
    </div>
  )
}
