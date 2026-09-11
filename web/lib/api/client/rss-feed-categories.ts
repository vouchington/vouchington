'use client'

import { clientApi } from './instance'

export async function rejectRssFeedCategory(categoryText: string): Promise<void> {
  await clientApi.post('/api/v1/rss-feed-categories/rejections', {
    category_text: categoryText,
  })
}

export async function unrejectRssFeedCategory(categoryText: string): Promise<void> {
  await clientApi.delete('/api/v1/rss-feed-categories/rejections', {
    body: { category_text: categoryText },
  })
}

export async function assignRssFeedCategory(
  categoryText: string,
  topicId: string,
): Promise<{ updated: number }> {
  return clientApi.post<{ updated: number }>('/api/v1/rss-feed-categories/assignments', {
    category_text: categoryText,
    topic_id: topicId,
  })
}
