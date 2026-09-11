import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { ErrorBoundary } from '@/components/ui/error-boundary'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getEntityRelations } from '@/lib/api/server'
import { getPublisherTypes } from '@/lib/api/server/topics'
import { getTranslations } from '@/lib/i18n/get-translations'
import { ManageTagsContent } from './manage-tags-content'
import { ManageTagsCard } from './manage-tags-card'
import type { TagRelationTab } from './tag-relation-configs'

const tagsErrorFallback = <div className='text-sm text-destructive'>Error loading tags</div>
const tagsLoadingFallback = <div className='text-sm text-muted-foreground'>Loading...</div>

interface ManageTagsTabsProps {
  entityType: string
  entityId: string
  tabs: readonly TagRelationTab[]
  activeTab: string
}

export async function ManageTagsTabs({
  entityType,
  entityId,
  tabs,
  activeTab,
}: ManageTagsTabsProps) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect('/login')
  }

  const t = await getTranslations()
  const activeTabConfig = tabs.find(tab => tab.value === activeTab) ?? tabs[0]!
  const relationsPromise = getEntityRelations(
    entityType,
    entityId,
    activeTabConfig.predicate,
    activeTabConfig.objectType,
    { searchParams: { sort: 'best' } },
  )

  const enumOptions =
    activeTabConfig.predicate === 'publisher_type'
      ? (await getPublisherTypes()).publisher_types
      : undefined

  return (
    <div className='space-y-4'>
      <ManageTagsCard heading={t(activeTabConfig.label)}>
        <ErrorBoundary fallback={tagsErrorFallback}>
          <Suspense fallback={tagsLoadingFallback}>
            <ManageTagsContent
              entityType={entityType}
              entityId={entityId}
              predicate={activeTabConfig.predicate}
              objectType={activeTabConfig.objectType}
              label={t(activeTabConfig.label)}
              relationsPromise={relationsPromise}
              enumOptions={enumOptions}
              isAuthenticated
            />
          </Suspense>
        </ErrorBoundary>
      </ManageTagsCard>
    </div>
  )
}
