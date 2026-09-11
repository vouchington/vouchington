import { PostContentText } from '@/components/posts/post-content-text'

interface LandingReviewTitleProps {
  review: {
    title: string | null
    markdown: string
    declared_language: string | null
    lingua_rs_detected_language: string | null
  }
}

export function LandingReviewTitle({ review }: LandingReviewTitleProps) {
  return (
    <PostContentText
      as='span'
      content={{
        text: review.title?.trim() ? review.title : review.markdown.slice(0, 40),
        declared_language: review.declared_language,
        lingua_rs_detected_language: review.lingua_rs_detected_language,
      }}
    />
  )
}
