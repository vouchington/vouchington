import { randomUUID } from 'node:crypto'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createTestUser } from './entities/users.mts'
import { blockUrlHostname, followUser, muteUrlHostname } from './entities/test-entities.mts'
import { insertTestUrl } from './entities/urls.mts'
import { insertTestUrlHostname } from './entities/url-hostnames/mutations.mts'

/** A viewer who both blocks and mutes a parent hostname with an eligible child URL. */
export async function createHostnameExclusionFixture(
  options: {
    patternWildcard?: '_' | '%'
  } = {},
): Promise<{
  viewer: PrivateUser
  publisher: PrivateUser
  blockedUrlId: string
  visibleUrlId: string
}> {
  const viewer = await createTestUser()
  const publisher = await createTestUser()
  await followUser(viewer, publisher)

  const suffix = randomUUID()
  const parentHostname = options.patternWildcard
    ? `blocked${options.patternWildcard}${suffix}.example.com`
    : `blocked-${suffix}.example.com`
  const parentHostnameId = await insertTestUrlHostname({ hostname: parentHostname })
  const blockedHostname = options.patternWildcard
    ? `child.blockedx${suffix}.example.com`
    : `child.${parentHostname}`
  const childHostnameId = await insertTestUrlHostname({ hostname: blockedHostname })
  const visibleHostnameId = await insertTestUrlHostname({
    hostname: `visible-${suffix}.example.net`,
  })
  const [blockedUrlId, visibleUrlId] = await Promise.all([
    insertTestUrl({
      url: `https://${blockedHostname}/blocked`,
      hostnameId: childHostnameId,
    }),
    insertTestUrl({
      url: `https://visible-${suffix}.example.net/allowed`,
      hostnameId: visibleHostnameId,
    }),
  ])

  await blockUrlHostname(viewer, parentHostnameId)
  await muteUrlHostname(viewer, parentHostnameId)

  return { viewer, publisher, blockedUrlId, visibleUrlId }
}
