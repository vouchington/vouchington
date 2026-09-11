import { upsertUrlHostnames } from '@services/urls-hostnames'

export async function getFetchHostnameId(
  originalHostnameId: string,
  originalUrl: string,
  feedUrl: string,
): Promise<string> {
  if (feedUrl === originalUrl) return originalHostnameId

  const hostname = new URL(feedUrl).hostname
  const hostnamesMap = await upsertUrlHostnames(null, [hostname])
  return [...hostnamesMap.values()][0] ?? originalHostnameId
}
