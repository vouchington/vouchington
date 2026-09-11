'use client'

import Link from 'next/link'
import { PostContentText } from '@/components/posts/post-content-text'
import { reviewHref } from '@/lib/links/entity-href'
import type { ReviewDispute, ReviewDisputeActorSummary } from '@/types/review-disputes'

function actorLabel(actor: ReviewDisputeActorSummary): string {
  return actor.verified_display_name ?? actor.username ?? actor.id
}

export function DisputeContext({ dispute }: { dispute: ReviewDispute }) {
  const review = dispute.staff_context?.review
  const target = dispute.post_content ? (
    <PostContentText
      as={Link}
      href={reviewHref(dispute.post_id)}
      className='font-medium underline'
      prefetch={false}
      content={dispute.post_content}
    />
  ) : (
    <p className='font-medium'>{dispute.post_id}</p>
  )

  return (
    <div
      className='space-y-1 text-xs'
      data-pw='dispute-context'
    >
      {target}
      {review?.post.markdown_preview ? (
        <PostContentText
          as='p'
          className='line-clamp-2 text-muted-foreground'
          content={{
            text: review.post.markdown_preview,
            declared_language: review.post.declared_language,
            lingua_rs_detected_language: review.post.lingua_rs_detected_language,
          }}
        />
      ) : null}
      {review?.topic ? <p className='text-muted-foreground'>{review.topic.name}</p> : null}
      {review?.rating !== null && review?.rating !== undefined ? (
        <p className='text-muted-foreground'>{review.rating}/5</p>
      ) : null}
      {dispute.staff_context ? <p>{actorLabel(dispute.staff_context.disputant)}</p> : null}
      {dispute.claim_text ? (
        <p className='line-clamp-3 text-muted-foreground'>{dispute.claim_text}</p>
      ) : null}
    </div>
  )
}
