export type TopicRecommendationInputFields = {
  topic_title?: string
  topic_slug?: string
  topic_markdown?: string
  topic_hostname?: string
  topic_hostnames?: string[]
  topic_aliases?: string[]
  topic_type?: 'topic' | 'referral_program' | 'card'
  example_referral_link?: string
  landing_page_urls?: string[]
}
