import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { UserAvatar } from '@/components/shared/user-avatar'
import { UserLink } from '@/components/users/user-link'
import { MARKDOWN_CONTENT_FEATURES_UTM } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { UserProfileLinks } from '@/components/users/profile-links'

import type { AuthorAside, PostCreatedBy, PostType } from '@/types/posts'
import { userTabForPostType } from '@/lib/links/entity-href'
import type { getTranslations } from '@/lib/i18n/get-translations'
import type { FollowButton as FollowButtonComponent } from '@/components/shared/follow-button'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowButton = dynamic<Parameters<typeof FollowButtonComponent>[0]>(() =>
  import('@/components/shared/follow-button').then(mod => mod.FollowButton),
)

interface PostAuthorAsideProps {
  t: Awaited<ReturnType<typeof getTranslations>>
  author: PostCreatedBy
  aside: AuthorAside | null
  postType: PostType
}

export function PostAuthorAside({ t, author, aside, postType }: PostAuthorAsideProps) {
  const tab = userTabForPostType(postType)
  const showFollow = !!aside

  return (
    <Card className='p-4'>
      <h3
        className='mb-3 text-sm font-semibold'
        data-pw='post-author-aside-heading'
      >
        {t('extracted.posts.postAuthorAside.author_d95082a2')}
      </h3>
      <div className='space-y-3'>
        <UserLink
          user={author}
          tab={tab}
          className='flex items-center gap-2 hover:opacity-80'
          data-pw='post-author-aside-user-link'
        >
          <UserAvatar
            profileImageId={author.profile_image_id}
            username={author.username}
            size='sm'
          />
          <span className='text-sm font-medium'>{author.username}</span>
        </UserLink>

        {aside?.about_html && (
          <div data-pw='post-author-aside-bio'>
            <MarkdownContent
              html={aside.about_html}
              className='prose prose-sm max-w-none dark:prose-invert line-clamp-4 text-muted-foreground'
              features={MARKDOWN_CONTENT_FEATURES_UTM}
            />
            <UserLink
              user={author}
              className='mt-1 text-xs text-muted-foreground hover:underline'
              data-pw='post-author-aside-read-more'
            >
              {t('extracted.posts.postAuthorAside.readMore_50290b5b')}
            </UserLink>
          </div>
        )}

        {showFollow && (
          <FollowButton
            entityType='user'
            entityId={author.id}
            isFollowing={aside?.is_following}
          />
        )}

        {aside?.profile_links && aside.profile_links.length > 0 && (
          <UserProfileLinks
            variant='icons'
            links={aside.profile_links}
            t={t}
          />
        )}
      </div>
    </Card>
  )
}
