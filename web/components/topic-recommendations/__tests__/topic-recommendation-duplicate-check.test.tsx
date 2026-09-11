import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TopicRecommendationDuplicateCheck } from '@/components/topic-recommendations/topic-recommendation-duplicate-check'

function pw(container: HTMLElement, selector: string) {
  return container.querySelector(`[data-pw="${selector}"]`)
}

describe('TopicRecommendationDuplicateCheck', () => {
  it('renders nothing when below min length', () => {
    const { container } = render(
      <TopicRecommendationDuplicateCheck
        data={null}
        isLoading={false}
        isBelowMinLength
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when data is null and not loading', () => {
    const { container } = render(
      <TopicRecommendationDuplicateCheck
        data={null}
        isLoading={false}
        isBelowMinLength={false}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows loading indicator while in-flight', () => {
    const { container } = render(
      <TopicRecommendationDuplicateCheck
        data={null}
        isLoading
        isBelowMinLength={false}
      />,
    )
    expect(pw(container, 'duplicate-check-loading')).toBeInTheDocument()
  })

  it('shows blocking exact-topic error with link when exact_topic is present', () => {
    const { container } = render(
      <TopicRecommendationDuplicateCheck
        data={{
          exact_topic: {
            id: 'topic-1',
            name: 'American Express',
            slug: 'american-express',
            topic_type: 'topic',
          },
          pending_recommendations: [],
          similar_topics: [],
        }}
        isLoading={false}
        isBelowMinLength={false}
      />,
    )
    expect(pw(container, 'duplicate-check-results')).toBeInTheDocument()
    expect(pw(container, 'duplicate-check-exact-topic')).toBeInTheDocument()
    const link = pw(container, 'duplicate-check-exact-topic-link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveTextContent('American Express')
  })

  it('shows blocking pending-rec warning with link when pending recommendations exist', () => {
    const { container } = render(
      <TopicRecommendationDuplicateCheck
        data={{
          exact_topic: null,
          pending_recommendations: [
            { post_id: 'post-1', topic_title: 'Chase Sapphire', topic_slug: 'chase-sapphire' },
          ],
          similar_topics: [],
        }}
        isLoading={false}
        isBelowMinLength={false}
      />,
    )
    expect(pw(container, 'duplicate-check-results')).toBeInTheDocument()
    expect(pw(container, 'duplicate-check-pending-rec')).toBeInTheDocument()
    const link = pw(container, 'duplicate-check-pending-rec-link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/topic-recommendations')
  })

  it('renders similar topics section when only similar_topics are present', () => {
    const { container } = render(
      <TopicRecommendationDuplicateCheck
        data={{
          exact_topic: null,
          pending_recommendations: [],
          similar_topics: [
            { id: 'topic-2', name: 'Amex Gold', slug: 'amex-gold', topic_type: 'topic' },
          ],
        }}
        isLoading={false}
        isBelowMinLength={false}
      />,
    )
    expect(pw(container, 'duplicate-check-results')).toBeInTheDocument()
    expect(pw(container, 'duplicate-check-exact-topic')).not.toBeInTheDocument()
    expect(pw(container, 'duplicate-check-pending-rec')).not.toBeInTheDocument()
    expect(screen.getByText('Similar existing topics')).toBeInTheDocument()
  })
})
