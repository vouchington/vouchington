import { createSlugFromTitle } from '@modules/utils'
import { randomBytes } from 'node:crypto'

export function generateSourceDetails(
  topicName: string,
  feedTitle: string,
  feedUrl: string,
  attempt: number,
): { name: string; slug: string } {
  const urlPart = feedUrl
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .replace(/[./=?&#]/g, ' ')
  const baseSlug = createSlugFromTitle(`${feedTitle} ${urlPart}`, 250)
    .slice(0, 250)
    .replace(/-+$/, '')
  if (attempt === 0) return { name: topicName, slug: baseSlug }
  const suffix = randomBytes(2).toString('hex')
  return { name: topicName, slug: `${baseSlug}-${suffix}` }
}
