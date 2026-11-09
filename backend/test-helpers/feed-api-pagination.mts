import type { createRequest } from './api/server.mts'

export async function findFeedPost(
  request: ReturnType<typeof createRequest>,
  path: string,
  postId: string,
  deliveryType?: 'share',
) {
  let after: string | undefined
  for (let pageIndex = 0; pageIndex < 30; pageIndex++) {
    const response = await request.get(path).query({ after }).expect(200)
    if (
      response.body.results.some(
        (row: { entity_id: string; delivery_type: string }) =>
          row.entity_id === postId && (!deliveryType || row.delivery_type === deliveryType),
      )
    )
      return response
    const cursor = response.body.page_info.end_cursor
    if (!response.body.page_info.has_next_page || !cursor || cursor === after)
      throw new Error('Feed exhausted or failed to advance before the owned post')
    after = cursor
  }
  throw new Error('Owned post not found in bounded feed pages')
}
