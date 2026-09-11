'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { MARKDOWN_CONTENT_FEATURES_RICH } from '@/components/shared/markdown-content-features'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { fetchPostAncestors } from '@/lib/api/client/posts'
import { mergePostAncestorPages } from '@/lib/api/merge-post-descendant-pages'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import type { PostsResponseBody } from '@/types/api-responses'
import type { Post } from '@/types/posts'

interface CommentAncestorTrailProps {
  targetCommentId: string
  rootPostId: string
  rootPostPath: string
  initialAncestors: PostsResponseBody
}

export function CommentAncestorTrail({
  targetCommentId,
  rootPostId,
  rootPostPath,
  initialAncestors,
}: CommentAncestorTrailProps) {
  const t = useTranslations()
  const pagination = usePaginatedList(
    initialAncestors,
    `/api/v1/posts/${encodeURIComponent(targetCommentId)}/ancestors`,
    { limit: 5 },
    {
      loadPage: after => fetchPostAncestors(targetCommentId, { after, limit: 5 }),
    },
  )
  const ancestors = mergePostAncestorPages(pagination.pages)
  const ancestorPosts = ancestors.results.flatMap(result => {
    const post = ancestors.posts?.[result.id]
    return post && post.id !== rootPostId && post.id !== targetCommentId ? [post] : []
  })

  return (
    <>
      {pagination.hasNextPage && (
        <div className='flex flex-col items-center gap-2 py-2'>
          {pagination.fetchError && (
            <p
              className='text-sm text-destructive'
              role='alert'
              aria-live='assertive'
            >
              {t('extracted.comments.commentAncestorTrail.failedToLoadEarlierReplies_2a3cdd19')}
            </p>
          )}
          <Button
            variant='outline'
            size='sm'
            disabled={pagination.loadingMore}
            onClick={() => {
              if (pagination.fetchError) pagination.clearError()
              void pagination.loadMore()
            }}
          >
            {pagination.fetchError
              ? t('extracted.shared.paginatedListFooter.retry_942087cc')
              : pagination.loadingMore
                ? t('extracted.shared.paginatedListFooter.loading_ba3bbbe1')
                : t('extracted.comments.commentAncestorTrail.showEarlierReplies_56b87971')}
          </Button>
        </div>
      )}

      {ancestorPosts.map(ancestor => (
        <AncestorComment
          key={ancestor.id}
          ancestor={ancestor}
          html={ancestors.markdown_to_html?.[ancestor.id] ?? ''}
          href={`${rootPostPath}/comment/${ancestor.id}`}
        />
      ))}
    </>
  )
}

function AncestorComment({ ancestor, html, href }: { ancestor: Post; html: string; href: string }) {
  const t = useTranslations()
  const author = ancestor.deleted_at
    ? t('extracted.comments.commentPermalink.deleted_dd5f43ed')
    : ancestor.created_by?.username
      ? ancestor.created_by.username
      : ancestor.is_anonymous
        ? t('extracted.comments.commentPermalink.anonymous_e7a8aa2d')
        : t('extracted.comments.commentPermalink.deleted_dd5f43ed')

  return (
    <div className='border-l-2 border-muted pl-4'>
      <div className='rounded-md border border-muted bg-muted/30 p-4 text-sm'>
        <div className='mb-1 text-xs text-muted-foreground'>
          <Link
            prefetch={false}
            href={href}
            className='hover:underline'
          >
            {author}
          </Link>
        </div>
        {ancestor.deleted_at ? (
          <p className='italic text-muted-foreground'>
            {t('extracted.comments.commentPermalink.deleted_dd5f43ed')}
          </p>
        ) : (
          <MarkdownContent
            html={html}
            className='prose prose-sm max-w-none dark:prose-invert'
            features={MARKDOWN_CONTENT_FEATURES_RICH}
            lang={getEffectiveContentLanguage({
              declaredLanguage: ancestor.declared_language,
              detectedLanguage: ancestor.lingua_rs_detected_language,
            })}
          />
        )}
      </div>
      <div className='ml-4 mt-1 text-muted-foreground'>│</div>
    </div>
  )
}
