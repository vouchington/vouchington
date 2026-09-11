'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { updateCommunityPostTypeSettings } from '@/lib/api/client/communities'
import onError, { onSuccess } from '@/lib/on-error'
import type { Community } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunityPostTypeSettingsFormProps {
  community: Pick<Community, 'slug' | 'allow_review_posts' | 'allow_data_point_posts'>
}

export function CommunityPostTypeSettingsForm({ community }: CommunityPostTypeSettingsFormProps) {
  const t = useTranslations()
  const router = useRouter()
  // oxlint-disable-next-line react-doctor/no-derived-useState -- form edits start from server values; refresh remounts after save.
  const [allowReviewPosts, setAllowReviewPosts] = useState(community.allow_review_posts)
  // oxlint-disable-next-line react-doctor/no-derived-useState -- form edits start from server values; refresh remounts after save.
  const [allowDataPointPosts, setAllowDataPointPosts] = useState(community.allow_data_point_posts)
  const [isSaving, setIsSaving] = useState(false)
  const [isNavigating, startNavigation] = useTransition()
  const isBusy = isSaving || isNavigating

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy) return

    setIsSaving(true)
    try {
      await updateCommunityPostTypeSettings(community.slug, {
        allow_review_posts: allowReviewPosts,
        allow_data_point_posts: allowDataPointPosts,
      })
      onSuccess(
        t('extracted.communities.communityPostTypeSettingsForm.postTypeSettingsSaved_56838c16'),
      )
      startNavigation(() => router.refresh())
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.communities.communityPostTypeSettingsForm.couldNotSavePostTypeSettings_76037ef5',
        ),
        tags: { form: 'community-post-type-settings' },
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-3 rounded-md border p-4'
    >
      <h3 className='text-sm font-semibold'>
        {t('extracted.communities.communityPostTypeSettingsForm.allowedPostTypes_05bea93e')}
      </h3>
      <div className='space-y-3'>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='allow-review-posts'
            checked={allowReviewPosts}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
              setAllowReviewPosts(checked === true)
            }
          />
          <Label
            htmlFor='allow-review-posts'
            className='cursor-pointer font-normal'
          >
            {t('extracted.communities.communityPostTypeSettingsForm.allowReviews_7743b469')}
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='allow-data-point-posts'
            checked={allowDataPointPosts}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
              setAllowDataPointPosts(checked === true)
            }
          />
          <Label
            htmlFor='allow-data-point-posts'
            className='cursor-pointer font-normal'
          >
            {t('extracted.communities.communityPostTypeSettingsForm.allowDataPoints_0dde7ed3')}
          </Label>
        </div>
      </div>
      <Button
        type='submit'
        size='sm'
        loading={isBusy}
        disabled={isBusy}
      >
        {isBusy
          ? t('extracted.communities.communityPostTypeSettingsForm.saving_dc85af8f')
          : t('extracted.communities.communityPostTypeSettingsForm.savePostTypes_b86dd4c9')}
      </Button>
    </form>
  )
}
