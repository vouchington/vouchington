import { addUrl } from '@services/urls/upsert'

export async function resolveProfileLinkUrlId(
  userId: string,
  url: string | null | undefined,
): Promise<string | null> {
  if (!url || typeof url !== 'string') return null
  const result = await addUrl(userId, url)
  return result?.id ?? null
}
