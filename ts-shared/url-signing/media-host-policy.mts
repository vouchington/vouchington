import { createProtectedHostPolicy } from '@vouchington/utils/url-signing'

const CANONICAL_FIRST_PARTY_MEDIA_HOSTS = ['images.voucha.ai', 'images-staging.voucha.ai'] as const

function configuredMediaHosts(
  env: NodeJS.ProcessEnv,
  imageOrigin?: string,
  aliases?: readonly string[],
) {
  return createProtectedHostPolicy([
    ...CANONICAL_FIRST_PARTY_MEDIA_HOSTS,
    ...(env.IMAGE_ORIGIN ? [env.IMAGE_ORIGIN] : []),
    ...(env.MEDIA_SOURCE_HOST_ALIASES ?? '').split(','),
    ...(imageOrigin ? [imageOrigin] : []),
    ...(aliases ?? []),
  ])
}

/** Uses Voucha's canonical hosts plus the supplied product configuration. */
export function isFirstPartyMediaUrl(
  url: URL,
  options: { imageOrigin?: string; aliases?: readonly string[]; env?: NodeJS.ProcessEnv } = {},
): boolean {
  return configuredMediaHosts(
    options.env ?? process.env,
    options.imageOrigin,
    options.aliases,
  ).isProtected(url)
}

export function firstPartyMediaBlockedHosts(env: NodeJS.ProcessEnv = process.env): {
  exact: string[]
  suffixes: string[]
} {
  return configuredMediaHosts(env).blockedHosts()
}
