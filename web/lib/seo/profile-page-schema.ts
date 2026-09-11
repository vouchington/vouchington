import { buildAbsoluteUrl } from './constants'

interface ProfilePageOptions {
  username: string
  displayName?: string | null
  path: string
  identifier: string
  imagePath?: string | null
  dateCreated?: string
  sameAs?: string[]
}

export function createProfilePageSchema({
  username,
  displayName,
  path,
  identifier,
  imagePath,
  dateCreated,
  sameAs,
}: ProfilePageOptions): Record<string, unknown> {
  const mainEntity: Record<string, unknown> = {
    '@type': 'Person',
    name: displayName || username,
    identifier,
    url: buildAbsoluteUrl(path),
  }

  if (displayName && displayName !== username) {
    mainEntity.alternateName = username
  }

  if (imagePath) {
    mainEntity.image = buildAbsoluteUrl(imagePath)
  }

  if (sameAs?.length) {
    mainEntity.sameAs = sameAs
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: buildAbsoluteUrl(path),
    ...(dateCreated ? { dateCreated } : {}),
    mainEntity,
  }
}
