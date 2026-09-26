import { storyMutationAt, storyText } from './story-mutation-bodies'

export function storyClaimMutation(endpoint: string, body: unknown): unknown | undefined {
  if (endpoint === '/api/v1/rss-feeds') {
    return {
      status: 'created',
      rss_feed_id: 'rss-feed-story',
      topic_id: 'topic-story',
      topic_slug: 'story-source',
    }
  }
  if (endpoint.endsWith('/verification-token')) {
    return {
      rawToken: 'story-verification-token',
      dnsInstructions: {
        recordType: 'TXT',
        hostname: '_voucha.example.com',
        value: 'voucha-verification=story-verification-token',
      },
      wellKnownInstructions: {
        url: 'https://example.com/.well-known/voucha-verification',
        fileContent: 'story-verification-token',
      },
    }
  }
  if (endpoint.endsWith('/claims')) {
    return {
      claim: { id: 'claim-story', claimed_role: storyText(body, 'claimed_role') },
      is_duplicate: false,
    }
  }
  if (endpoint.endsWith('/domain-verification') || endpoint.endsWith('/manual-review-submission')) {
    return { claim: { id: endpoint.split('/')[6] ?? 'claim-story' } }
  }
  return undefined
}

export function referralValidation(body: unknown): unknown {
  return {
    validation: {
      id: 'validation-story',
      slug: storyText(body, 'slug') || 'validation-story',
      user_help_text: storyText(body, 'user_help_text'),
      updated_at: storyMutationAt,
    },
  }
}
