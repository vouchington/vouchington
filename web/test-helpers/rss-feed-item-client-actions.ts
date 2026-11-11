import type { AdmissionIdempotency, ClientRequest } from '@vouchington/api-client'
import type { PostMutationResponseBody } from '@/types/api-responses/posts-topics-and-feeds'

export function createRssFeedItemClientActions(
  clientApi: Pick<ClientRequest, 'post'>,
  admissionIdempotency: Pick<AdmissionIdempotency, 'run'>,
) {
  async function createLinkPostFromRssFeedItem(itemId: string): Promise<PostMutationResponseBody> {
    const endpoint = '/api/v1/posts'
    const body = { post_type: 'link' as const, rss_feed_item_id: itemId }
    const intent = { endpoint, body }
    return admissionIdempotency.run(intent, idempotencyKey =>
      clientApi.post<PostMutationResponseBody>(endpoint, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    )
  }

  return { createLinkPostFromRssFeedItem }
}
