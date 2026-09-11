'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TopicRecommendationDialogFields } from './topic-recommendation-dialog-fields'
import { TopicRecommendationDialogFooter } from './topic-recommendation-dialog-footer'
import { TopicRecommendationDialogStatusInfo } from './topic-recommendation-dialog-status-info'
import { TopicRecommendationDialogSummary } from './topic-recommendation-dialog-summary'
import type { TopicRecommendationDialogProps } from './topic-recommendation-dialog-types'
import { useTopicRecommendationNavigation } from './use-topic-recommendation-navigation'
import { useTranslations } from '@/lib/i18n/use-translations'

export function TopicRecommendationDialog(props: TopicRecommendationDialogProps) {
  const t = useTranslations()
  const {
    selected,
    editableState,
    isAdmin,
    isSaving,
    onOpenChange,
    orderedPostIds,
    navigateToId,
    onApprove,
    onReject,
    users,
  } = props

  const navigation = useTopicRecommendationNavigation({
    isAdmin,
    isSaving,
    navigateToId,
    onApprove,
    onReject,
    orderedPostIds,
    selected,
  })

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selected || !isAdmin || isSaving || selected.topic_recommendation?.status !== 'pending')
      return
    void props.onPersistChanges(selected)
  }

  return (
    <Dialog
      open={selected != null}
      onOpenChange={onOpenChange}
    >
      <DialogContent className='grid max-h-[85vh] w-[calc(100vw-1rem)] max-w-3xl min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-3 sm:w-[calc(100vw-2rem)] sm:p-4'>
        {selected && editableState ? (
          <>
            <DialogHeader>
              <DialogTitle>{selected.topic_recommendation?.topic_title}</DialogTitle>
              <DialogDescription>
                {t(
                  'extracted.topicRecommendations.topicRecommendationDialog.proposedSlugSlug_078ee5e7',
                  {
                    slug: selected.topic_recommendation?.topic_slug,
                  },
                )}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className='min-h-0 min-w-0'>
              <form
                id='topic-recommendation-form'
                onSubmit={handleFormSubmit}
                className='space-y-6 p-1'
              >
                <TopicRecommendationDialogSummary {...props} />
                <TopicRecommendationDialogFields {...props} />
                <TopicRecommendationDialogStatusInfo
                  selected={selected}
                  users={users}
                />
              </form>
            </ScrollArea>
            <TopicRecommendationDialogFooter
              {...props}
              hasPrevious={navigation.hasPrevious}
              hasNext={navigation.hasNext}
              previousRef={navigation.previousRef}
              nextRef={navigation.nextRef}
              onNavigatePrevious={navigation.handleNavigatePrevious}
              onNavigateNext={navigation.handleNavigateNext}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
