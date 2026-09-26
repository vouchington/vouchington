'use client'

import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CheckboxCard } from '@/components/ui/checkbox-card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Post, PostBroadcast, PostPrivacy } from '@/types/posts'
import { PostArchiveButton } from './post-archive-button'
import { AudienceField, PostLanguageField, VisibilityField } from './advanced-options-fields'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AdvancedOptions({
  broadcast,
  isAdvancedOpen,
  isAnonymous,
  language,
  isCommunityPost,
  isPrivateCommunityPost,
  post,
  privacy,
  setBroadcast,
  setIsAdvancedOpen,
  setIsAnonymous,
  setLanguage,
  setPrivacy,
}: {
  broadcast: PostBroadcast
  isAdvancedOpen: boolean
  isAnonymous: boolean
  language: string | null
  isCommunityPost: boolean
  isPrivateCommunityPost: boolean
  post?: Post
  privacy: PostPrivacy
  setBroadcast: (broadcast: PostBroadcast) => void
  setIsAdvancedOpen: (open: boolean) => void
  setIsAnonymous: (anonymous: boolean) => void
  setLanguage: (language: string | null) => void
  setPrivacy: (privacy: PostPrivacy) => void
}) {
  const t = useTranslations()
  return (
    <Collapsible
      open={isAdvancedOpen}
      onOpenChange={setIsAdvancedOpen}
    >
      <CollapsibleTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='flex items-center gap-1 px-0 text-sm font-medium'
          data-pw='post-form-advanced-toggle'
        >
          {t('extracted.postForm.advancedOptions.advanced_9f088dbe')}
          <ChevronDown
            className={`h-4 w-4 transition-transform${isAdvancedOpen ? ' rotate-180' : ''}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-4 pt-2'>
        <AudienceField
          broadcast={broadcast}
          isCommunityPost={isCommunityPost}
          isPrivateCommunityPost={isPrivateCommunityPost}
          setBroadcast={setBroadcast}
          setPrivacy={setPrivacy}
        />
        {broadcast !== 'everyone' && (
          <VisibilityField
            isCommunityPost={isCommunityPost}
            privacy={privacy}
            setPrivacy={setPrivacy}
          />
        )}
        {!post && (
          <PostLanguageField
            language={language}
            setLanguage={setLanguage}
          />
        )}
        <CheckboxCard
          id='is-anonymous'
          checked={isAnonymous}
          onCheckedChange={setIsAnonymous}
          label={t('extracted.postForm.advancedOptions.postAnonymously_fa5c7ddd')}
          description={t('extracted.postForm.advancedOptions.onlyYouAndAdminsWillSee_ee1dabb3')}
          data-pw='post-form-anonymous-checkbox'
        />
        {post && (
          <div className='border-t pt-4'>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <div className='space-y-1'>
                <p className='text-sm font-medium leading-none'>
                  {t('extracted.postForm.advancedOptions.postStatus_5db4bfbc')}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {t(
                    'extracted.postForm.advancedOptions.archivedPostsAreHiddenFromPublic_59245c46',
                  )}
                </p>
              </div>
              <PostArchiveButton
                archivedAt={post.archived_at}
                postIdOrSlug={post.slug ?? post.id}
              />
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
