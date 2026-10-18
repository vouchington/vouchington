import { storyMutationAt, storyText } from './story-mutation-bodies'

const sourceImportId = 'source-import-story'
let sourceImportUrl = 'https://example.com/feed.xml'

export function resetStorySourceImport(): void {
  sourceImportUrl = 'https://example.com/feed.xml'
}

export function storySourceImportStatus(endpoint: string): unknown | undefined {
  if (endpoint !== `/api/v1/my/import/rss-feeds/${sourceImportId}`) return undefined
  return {
    import: {
      id: sourceImportId,
      total_rows: 1,
      completed_rows: 1,
      failed_rows: 0,
      pending_rows: 0,
      completed_at: storyMutationAt,
      created_at: storyMutationAt,
    },
    rows: [
      {
        input: sourceImportUrl,
        status: 'source_created',
        entity_id: 'rss-feed-story',
        topic_slug: 'story-source',
      },
    ],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

export function storyClaimMutation(endpoint: string, body: unknown): unknown | undefined {
  if (endpoint === '/api/v1/rss-feeds') {
    sourceImportUrl = storyText(body, 'rss_feed_url') || sourceImportUrl
    return {
      import: {
        id: sourceImportId,
        total_rows: 1,
        completed_rows: 0,
        failed_rows: 0,
        pending_rows: 1,
        completed_at: null,
        created_at: storyMutationAt,
      },
      status_url: `/api/v1/my/import/rss-feeds/${sourceImportId}`,
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

export function referralValidation(body: unknown, id = 'validation-story'): unknown {
  return {
    validation: {
      id,
      slug: storyText(body, 'slug') || id,
      user_help_text: storyText(body, 'user_help_text'),
      updated_at: storyMutationAt,
    },
  }
}
