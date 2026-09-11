'use client'

import { MARKDOWN_CONTENT_FEATURES_RICH } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { PostContentText } from '@/components/posts/post-content-text'
import type { Post } from '@/types/posts'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CommentNodeContent({
  html,
  isDeleted,
  post,
}: {
  html: string | null
  isDeleted: boolean
  post: Post
}) {
  const t = useTranslations()
  const contentLanguage = getEffectiveContentLanguage({
    declaredLanguage: post.declared_language,
    detectedLanguage: post.lingua_rs_detected_language,
  })
  if (isDeleted)
    return (
      <p
        className='text-sm italic text-muted-foreground'
        data-pw='comment-deleted-placeholder'
      >
        {t('extracted.comments.commentNodeContent.deleted_dd5f43ed')}
      </p>
    )
  return (
    <div
      className='mb-2 text-sm'
      data-pw='comment-node-content'
    >
      {html !== null ? (
        <MarkdownContent
          html={html}
          className='prose prose-sm max-w-none dark:prose-invert'
          features={MARKDOWN_CONTENT_FEATURES_RICH}
          lang={contentLanguage}
        />
      ) : (
        <PostContentText
          as='p'
          className='whitespace-pre-wrap'
          content={{
            text: post.markdown,
            declared_language: post.declared_language,
            lingua_rs_detected_language: post.lingua_rs_detected_language,
          }}
        />
      )}
    </div>
  )
}
