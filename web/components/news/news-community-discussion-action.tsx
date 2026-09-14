'use client'

import { Button } from '@/components/ui/button'
import * as Sentry from '@sentry/nextjs'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { UsernameRequiredDialog } from '@/components/shared/username-required-dialog'
import { NewsCommunityDiscussionDialog } from './news-community-discussion-dialog'
import { useNewsCommunityDiscussionAction } from './use-news-community-discussion-action'
import type {
  NewsCommunityDiscussionTarget,
  NewsCommunityDiscussionUrl,
} from './community-discussion-types'
import { useTranslations } from '@/lib/i18n/use-translations'

interface NewsCommunityDiscussionActionProps {
  fixedCommunity?: NewsCommunityDiscussionTarget
  itemTitle?: string | null
  relatedUrls: NewsCommunityDiscussionUrl[]
  variant: 'button' | 'menu-item'
}

export function NewsCommunityDiscussionAction({
  fixedCommunity,
  itemTitle,
  relatedUrls,
  variant,
}: NewsCommunityDiscussionActionProps) {
  const t = useTranslations()
  const {
    open,
    communities,
    hasLoadedCommunities,
    communitySlug,
    setCommunitySlug,
    isLoadingCommunities,
    isSubmitting,
    usernameDialogOpen,
    turnstile,
    openDialog,
    handleOpenChange,
    handleUsernameSet,
    handleUsernameClose,
    submit,
  } = useNewsCommunityDiscussionAction({ fixedCommunity, itemTitle, relatedUrls })
  const StartDiscussionIcon = EntityActionIcons.startDiscussion

  const usernameDialog = (
    <UsernameRequiredDialog
      open={usernameDialogOpen}
      onUsernameSet={handleUsernameSet}
      onClose={handleUsernameClose}
      title={t('extracted.news.newsCommunityDiscussionAction.createAUsernameToStartA_29ac2bb4')}
      submitLabel={t('extracted.news.newsCommunityDiscussionAction.createUsernameDiscuss_29677f55')}
    />
  )

  const dialog = (
    <NewsCommunityDiscussionDialog
      fixedCommunity={fixedCommunity}
      open={open}
      communities={communities}
      hasLoadedCommunities={hasLoadedCommunities}
      communitySlug={communitySlug}
      isLoadingCommunities={isLoadingCommunities}
      isSubmitting={isSubmitting}
      turnstile={turnstile}
      onOpenChange={handleOpenChange}
      onCommunitySlugChange={setCommunitySlug}
      onSubmit={() => submit().catch(Sentry.captureException)}
    />
  )

  if (variant === 'menu-item') {
    return (
      <>
        <DropdownMenuItem
          data-pw='news-community-discuss-menu-item'
          onSelect={event => {
            event.preventDefault()
            openDialog()
          }}
        >
          <StartDiscussionIcon />
          {fixedCommunity
            ? t('extracted.news.newsCommunityDiscussionAction.discussInName_6ac54cae', {
                name: fixedCommunity.name,
              })
            : t('extracted.news.newsCommunityDiscussionAction.discussWithCommunity_72bb9e29')}
        </DropdownMenuItem>
        {dialog}
        {usernameDialog}
      </>
    )
  }

  return (
    <>
      <div className='pl-1'>
        <Button
          variant='ghost'
          size='sm'
          className='min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground'
          onClick={openDialog}
        >
          <StartDiscussionIcon data-icon='inline-start' />
          {t('extracted.news.newsCommunityDiscussionAction.discuss_3df75fc7')}
        </Button>
      </div>
      {dialog}
      {usernameDialog}
    </>
  )
}
