'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import type { NewsCommunityDiscussionTarget } from './community-discussion-types'
import { useTranslations } from '@/lib/i18n/use-translations'

interface NewsCommunityDiscussionDialogProps {
  fixedCommunity?: NewsCommunityDiscussionTarget
  open: boolean
  communities: NewsCommunityDiscussionTarget[]
  hasLoadedCommunities: boolean
  communitySlug: string
  isLoadingCommunities: boolean
  isSubmitting: boolean
  turnstile: ReturnType<typeof useTurnstileToken>
  onOpenChange: (open: boolean) => void
  onCommunitySlugChange: (slug: string) => void
  onSubmit: () => void
}

export function NewsCommunityDiscussionDialog({
  fixedCommunity,
  open,
  communities,
  hasLoadedCommunities,
  communitySlug,
  isLoadingCommunities,
  isSubmitting,
  turnstile,
  onOpenChange,
  onCommunitySlugChange,
  onSubmit,
}: NewsCommunityDiscussionDialogProps) {
  const t = useTranslations()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {fixedCommunity
              ? t('extracted.news.newsCommunityDiscussionDialog.discussInName_6ac54cae', {
                  name: fixedCommunity.name,
                })
              : t('extracted.news.newsCommunityDiscussionDialog.discussWithCommunity_fdc7bac4')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'extracted.news.newsCommunityDiscussionDialog.createACommunityDiscussionLinkedTo_89d92818',
            )}
          </DialogDescription>
        </DialogHeader>
        {!fixedCommunity && (
          <Select
            value={communitySlug}
            onValueChange={onCommunitySlugChange}
            disabled={communities.length === 0}
          >
            <SelectTrigger
              aria-label={t('extracted.news.newsCommunityDiscussionDialog.community_bb501d78')}
            >
              <SelectValue
                placeholder={
                  isLoadingCommunities && communities.length === 0
                    ? t('extracted.news.newsCommunityDiscussionDialog.loading_47d2a515')
                    : t('extracted.news.newsCommunityDiscussionDialog.selectCommunity_9c425b58')
                }
              />
            </SelectTrigger>
            <SelectContent>
              {communities.map(community => (
                <SelectItem
                  key={community.id}
                  value={community.slug}
                >
                  {community.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {communities.length === 0 && !isLoadingCommunities && hasLoadedCommunities && (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.news.newsCommunityDiscussionDialog.noAvailableCommunitiesFound_bfebc222')}
          </p>
        )}
        <TurnstileField turnstile={turnstile} />
        <DialogFooter>
          <Button
            type='button'
            onClick={onSubmit}
            loading={isSubmitting}
            disabled={!communitySlug || isSubmitting || !turnstile.token}
          >
            {isSubmitting
              ? t('extracted.news.newsCommunityDiscussionDialog.posting_e24da73e')
              : t('extracted.news.newsCommunityDiscussionDialog.startDiscussion_9dc60da8')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
