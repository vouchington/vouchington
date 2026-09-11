'use client'

import { Button } from '@/components/ui/button'
import {
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
import type { UseTurnstileTokenReturn } from '@/hooks/use-turnstile-token'
import type { Community } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DiscussInCommunityActionDialogProps {
  communities: Community[]
  communitySlug: string
  onCommunitySlugChange: (slug: string) => void
  isLoading: boolean
  hasLoadedCommunities: boolean
  isSubmitting: boolean
  turnstile: UseTurnstileTokenReturn
  onSubmit: () => void
}

export function DiscussInCommunityActionDialog({
  communities,
  communitySlug,
  onCommunitySlugChange,
  isLoading,
  hasLoadedCommunities,
  isSubmitting,
  turnstile,
  onSubmit,
}: DiscussInCommunityActionDialogProps) {
  const t = useTranslations()

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {t('extracted.posts.discussInCommunityAction.discussInACommunity_4ef3e3b0')}
        </DialogTitle>
        <DialogDescription>
          {t(
            'extracted.posts.discussInCommunityAction.createACommunityDiscussionLinkedTo_85162498',
          )}
        </DialogDescription>
      </DialogHeader>
      <Select
        value={communitySlug}
        onValueChange={onCommunitySlugChange}
        disabled={communities.length === 0}
      >
        <SelectTrigger
          aria-label={t('extracted.posts.discussInCommunityAction.community_bb501d78')}
          data-pw='discuss-in-community-select'
        >
          <SelectValue
            placeholder={
              isLoading && communities.length === 0
                ? t('extracted.posts.discussInCommunityAction.loading_47d2a515')
                : t('extracted.posts.discussInCommunityAction.selectCommunity_9c425b58')
            }
          />
        </SelectTrigger>
        <SelectContent>
          {communities.map(community => (
            <SelectItem
              key={community.id}
              value={community.slug}
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
              data-pw={`discuss-in-community-option-${community.slug}`}
            >
              {community.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {communities.length === 0 && !isLoading && hasLoadedCommunities && (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.posts.discussInCommunityAction.noAvailableCommunitiesFound_bfebc222')}
        </p>
      )}
      <TurnstileField turnstile={turnstile} />
      <DialogFooter>
        <Button
          type='button'
          onClick={onSubmit}
          loading={isSubmitting}
          disabled={!communitySlug || isSubmitting || !turnstile.token}
          data-pw='discuss-in-community-submit'
        >
          {isSubmitting
            ? t('extracted.posts.discussInCommunityAction.posting_e24da73e')
            : t('extracted.posts.discussInCommunityAction.startDiscussion_9dc60da8')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
