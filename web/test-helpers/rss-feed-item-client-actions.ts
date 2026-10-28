import type { AdmissionIdempotency, ClientRequest } from '@vouchington/api-client'
import type { PostMutationResponseBody } from '@/types/api-responses/posts-topics-and-feeds'

export function createRssFeedItemClientActions(
  clientApi: Pick<ClientRequest, 'post'>,
  admissionIdempotency: Pick<AdmissionIdempotency, 'run'>,
) {
  async function createLinkPostFromRssFeedItem(itemId: string): Promise<PostMutationResponseBody> {
    const endpoint = `/api/v1/rss-feed-items/${encodeURIComponent(itemId)}/discussions`
    const intent = { endpoint, body: {} }
    return admissionIdempotency.run(intent, idempotencyKey =>
      clientApi.post<PostMutationResponseBody>(
        endpoint,
        {},
        {
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      ),
    )
  }

  return { createLinkPostFromRssFeedItem }
}
