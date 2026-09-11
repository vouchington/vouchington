import Link from 'next/link'
import { MARKDOWN_CONTENT_FEATURES_RICH } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { PostComments } from '@/components/posts/post-comments'
import { PostContentText } from '@/components/posts/post-content-text'
import { CommentAncestorTrail } from './comment-ancestor-trail'
import type { PostsResponseBody } from '@/types/api-responses'
import type { Post } from '@/types/posts'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import type { getTranslations } from '@/lib/i18n/get-translations'

function getCommentAuthor(post: Post, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (post.deleted_at) return t('extracted.comments.commentPermalink.deleted_dd5f43ed')
  if (post.created_by?.username) return post.created_by.username
  if (post.is_anonymous) return t('extracted.comments.commentPermalink.anonymous_e7a8aa2d')
  return t('extracted.comments.commentPermalink.deleted_dd5f43ed')
}

interface CommentPermalinkProps {
  targetCommentId: string
  rootPostId: string
  rootPostType: string
  rootPost: Post
  ancestors: PostsResponseBody
  descendants: PostsResponseBody
  isAdmin: boolean
  hideDownCount: boolean
  t: Awaited<ReturnType<typeof getTranslations>>
}

export function CommentPermalink({
  targetCommentId,
  rootPostId,
  rootPostType,
  rootPost,
  ancestors,
  descendants,
  isAdmin,
  hideDownCount,
  t,
}: CommentPermalinkProps) {
  const targetPost = ancestors.posts?.[targetCommentId] ?? descendants.posts?.[targetCommentId]
  const targetHtml =
    ancestors.markdown_to_html?.[targetCommentId] ??
    descendants.markdown_to_html?.[targetCommentId] ??
    ''
  const rootPostPathId = rootPost.slug ?? rootPost.id
  const rootPostTitleText = rootPost.title || rootPost.markdown.slice(0, 80)
  const hasAuthoredTitle = Boolean(rootPostTitleText.trim())
  const rootPostTitle =
    rootPostTitleText || t('extracted.comments.commentPermalink.untitledPost_2e2fc1fc')

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-bold'>
        {t('extracted.comments.commentPermalink.commentOnTitle_02b6af38', { title: rootPostTitle })}
      </h1>
      {/* Root post link */}
      <div className='rounded-md border p-4 text-sm'>
        <Link
          prefetch={false}
          href={`/${rootPostType}/${rootPostPathId}`}
          className='font-medium text-blue-600 hover:underline'
          data-pw='comment-permalink-root-link'
        >
          ←{' '}
          <PostContentText
            as='span'
            content={
              hasAuthoredTitle
                ? {
                    text: rootPostTitleText,
                    declared_language: rootPost.declared_language,
                    lingua_rs_detected_language: rootPost.lingua_rs_detected_language,
                  }
                : null
            }
            fallback={rootPostTitle}
          />
        </Link>
      </div>

      <CommentAncestorTrail
        targetCommentId={targetCommentId}
        rootPostId={rootPostId}
        rootPostPath={`/${rootPostType}/${rootPostPathId}`}
        initialAncestors={ancestors}
      />

      {/* Target comment */}
      {targetPost && (
        <div className='rounded-md border-2 border-primary p-4'>
          <div className='mb-2 text-xs text-muted-foreground'>
            <span className='font-medium text-foreground'>{getCommentAuthor(targetPost, t)}</span>
          </div>
          {targetPost.deleted_at ? (
            <p className='italic text-muted-foreground'>
              {t('extracted.comments.commentPermalink.deleted_dd5f43ed')}
            </p>
          ) : (
            <MarkdownContent
              html={targetHtml}
              className='prose prose-sm max-w-none dark:prose-invert'
              features={MARKDOWN_CONTENT_FEATURES_RICH}
              lang={getEffectiveContentLanguage({
                declaredLanguage: targetPost.declared_language,
                detectedLanguage: targetPost.lingua_rs_detected_language,
              })}
            />
          )}
        </div>
      )}

      {/* Descendants */}
      <PostComments
        data={descendants}
        descendantsSourceId={targetCommentId}
        rootPostId={rootPostId}
        rootPostType={rootPostType}
        rootLockedAt={rootPost.locked_at ?? null}
        isAdmin={isAdmin}
        hideDownCount={hideDownCount}
      />
    </div>
  )
}
