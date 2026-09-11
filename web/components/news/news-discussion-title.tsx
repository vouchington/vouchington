import type { ReactNode } from 'react'
import { PostContentText } from '@/components/posts/post-content-text'
import type { Post } from '@/types/posts'

export function NewsDiscussionTitle({ post, fallback }: { post: Post; fallback: ReactNode }) {
  return (
    <PostContentText
      as='span'
      className='max-w-56 truncate'
      content={
        post.title?.trim()
          ? {
              text: post.title,
              declared_language: post.declared_language,
              lingua_rs_detected_language: post.lingua_rs_detected_language,
            }
          : null
      }
      fallback={fallback}
    />
  )
}
