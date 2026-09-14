'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { loadMyCommunities } from '@/lib/api/client/communities'
import { createCommunityPost } from '@/lib/api/client/posts'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useRecaptchaToken } from '@/hooks/use-recaptcha-token'
import { communityPendingPostsHref } from '@/lib/links/entity-href'
import { toast } from 'sonner'
import type { Community } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DiscussInCommunityActionDialog } from './discuss-in-community-action-dialog'

interface DiscussInCommunityActionProps {
  postId: string
  source: { title?: string | null; canonicalPath: string }
}

export function DiscussInCommunityAction({ postId, source }: DiscussInCommunityActionProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const [open, setOpen] = useState(false)
  const [communities, setCommunities] = useState<Community[]>([])
  const [hasLoadedCommunities, setHasLoadedCommunities] = useState(false)
  const [communitySlug, setCommunitySlug] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const turnstile = useTurnstileToken()
  const recaptcha = useRecaptchaToken()
  const StartDiscussionIcon = EntityActionIcons.startDiscussion

  async function loadCommunities() {
    if (hasLoadedCommunities || isLoading) return
    setIsLoading(true)
    let hasAvailableCommunities = communities.length > 0
    const showAvailableCommunities = (available: Community[]) => {
      hasAvailableCommunities = available.length > 0
      setCommunities(available)
      setCommunitySlug(current =>
        current && available.some(community => community.slug === current)
          ? current
          : available[0]?.slug || '',
      )
    }
    try {
      const available = await loadMyCommunities(undefined, [], showAvailableCommunities)
      showAvailableCommunities(available)
      setHasLoadedCommunities(true)
    } catch {
      toast.error(
        hasAvailableCommunities
          ? t('extracted.posts.discussInCommunityAction.couldNotLoadEveryCommunity_017411ef')
          : t('extracted.posts.discussInCommunityAction.couldNotLoadYourCommunities_e6130bd4'),
      )
    } finally {
      setIsLoading(false)
    }
  }

  async function submit() {
    if (!communitySlug || isSubmitting) return
    const selectedCommunity = communities.find(community => community.slug === communitySlug)
    if (!selectedCommunity) return
    const isPrivateCommunity = selectedCommunity.visibility === 'private'
    setIsSubmitting(true)
    try {
      const recaptchaToken = await recaptcha.execute('create_post')
      const response = await createCommunityPost(communitySlug, {
        community_id: selectedCommunity.id,
        post_type: 'discussion',
        parent_id: postId,
        title: source.title
          ? t('extracted.posts.discussInCommunityAction.discussTitle_f93b0bf5', {
              title: source.title,
            })
          : t('extracted.posts.discussInCommunityAction.communityDiscussion_95569db2'),
        markdown: `[${t('extracted.posts.discussInCommunityAction.sourcePost_2329681a')}](${source.canonicalPath})`,
        broadcast: isPrivateCommunity ? 'users' : 'everyone',
        privacy: isPrivateCommunity ? 'private' : 'public',
        cf_turnstile_response: turnstile.token ?? undefined,
        recaptcha_token: recaptchaToken ?? undefined,
      })
      setOpen(false)
      const discussion = response.post
      const requiresCommunityReview =
        response.community_post_review?.approved_at === null &&
        response.community_post_review.rejected_at === null &&
        response.community_post_review.unpublished_at === null
      push(
        selectedCommunity?.post_approval_required_at || requiresCommunityReview
          ? communityPendingPostsHref({ slug: communitySlug })
          : getCanonicalPostPath(discussion),
      )
    } catch (error) {
      // The token was consumed by the backend's verification; get a fresh one.
      turnstile.reset()
      toast.error(
        error instanceof Error
          ? error.message
          : t('extracted.posts.discussInCommunityAction.couldNotStartDiscussion_6132b3d7'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen)
        if (nextOpen) void loadCommunities()
      }}
    >
      <DialogTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='touchSm'
          data-pw='discuss-in-community-button'
        >
          <StartDiscussionIcon data-icon='inline-start' />
          {t('extracted.posts.discussInCommunityAction.discussInCommunity_0c5fc545')}
        </Button>
      </DialogTrigger>
      <DiscussInCommunityActionDialog
        communities={communities}
        communitySlug={communitySlug}
        onCommunitySlugChange={setCommunitySlug}
        isLoading={isLoading}
        hasLoadedCommunities={hasLoadedCommunities}
        isSubmitting={isSubmitting}
        turnstile={turnstile}
        onSubmit={submit}
      />
    </Dialog>
  )
}
