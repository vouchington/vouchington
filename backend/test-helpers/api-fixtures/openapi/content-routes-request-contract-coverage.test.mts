import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type Schema = Record<string, unknown>
type Carriers = { body?: Schema; header?: Schema; path?: Schema; query?: Schema }
type Bundle = { components: Record<string, Schema>; operations: Record<string, Carriers> }

const bundle = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../api-fixtures/v1/request-contracts.json', import.meta.url)),
    'utf8',
  ),
) as Bundle

/** Operations whose JSON body is a closed object, with the keys the wire contract requires. */
const closedBodies: Record<string, readonly string[]> = {
  'PUT:/api/v1/agent-moderations/:id/vote': ['choice'],
  'PUT:/api/v1/entity-relations/:id/vote': ['choice'],
  'PUT:/api/v1/hostnames/:id/vote': ['choice'],
  'PUT:/api/v1/users/:id/vouch-vote': ['choice'],
  'POST:/api/v1/app-attestation/attest': ['attestation', 'challengeId', 'keyId'],
  'POST:/api/v1/app-attestation/challenge': ['type'],
  'POST:/api/v1/attribution/referrer': ['landing_url', 'referrer'],
  'POST:/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType': [],
  'PATCH:/api/v1/hostnames/:id': [],
  'POST:/api/v1/hostnames': ['hostname'],
  'PATCH:/api/v1/households/:id': [],
  'POST:/api/v1/households': [],
  'POST:/api/v1/households/:id/memberships': ['individual_id'],
  'POST:/api/v1/landing-pages/:landingPageId/clicks': ['landing_page_item_id'],
  'POST:/api/v1/landing-pages/:landingPageId/visits': [],
  'PATCH:/api/v1/lists/:id': [],
  'POST:/api/v1/lists': ['name'],
  'POST:/api/v1/lists/:id/import': ['community_slug'],
  'POST:/api/v1/lists/:id/items/posts': ['post_id'],
  'POST:/api/v1/lists/:id/items/rss-feed-items': ['rss_feed_item_id'],
  'POST:/api/v1/markdown/preview': [],
  'PUT:/api/v1/podcast-episodes/:id/playback-position': ['position_seconds'],
  'PATCH:/api/v1/users/:idOrSlug': [],
}

/** Operations with a paginated or filtered query carrier, and the keys it must declare. */
const queryCarriers: Record<string, readonly string[]> = {
  'GET:/api/v1/agent-moderations/:id/votes': ['after', 'limit'],
  'GET:/api/v1/entity-relations/:id/votes': ['after', 'limit'],
  'GET:/api/v1/hostnames/:id/votes': ['after', 'limit'],
  'GET:/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType': [
    'after',
    'limit',
    'minNetVoteScore',
    'positiveNetVoteScore',
    'sort',
  ],
  'GET:/api/v1/feeds/posts/:feed_type': ['after', 'community', 'limit', 'sort'],
  'GET:/api/v1/feeds/referral_links/:feed_type': ['after', 'limit'],
  'GET:/api/v1/feeds/rss_feed_items/:feed_type': [
    'after',
    'community',
    'has_related_posts',
    'limit',
    'media_type',
  ],
  'GET:/api/v1/hostnames': ['after', 'blocked', 'crawlable', 'hostname', 'limit'],
  'GET:/api/v1/households': ['access', 'after', 'limit'],
  'GET:/api/v1/households/:id/memberships': ['after', 'limit'],
  'GET:/api/v1/lists': ['after', 'limit'],
  'GET:/api/v1/lists/:id/items': ['after', 'limit', 'media_type', 'read'],
  'GET:/api/v1/urls/:id/crawls': ['after', 'limit'],
  'GET:/api/v1/users': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/communities/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/domains/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/posts/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/rss-feed-items/:listType': ['after', 'limit', 'media_type'],
  'GET:/api/v1/users/:idOrSlug/rss-feeds/:listType': ['after', 'feed_type', 'limit'],
  'GET:/api/v1/users/:idOrSlug/topics/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/urls/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/users/:listType': ['after', 'limit', 'q'],
}

const limitOperations = Object.keys(queryCarriers).filter(operation =>
  queryCarriers[operation]!.includes('limit'),
)

/**
 * Operations recorded as skipped: their only declared carrier is a free-form string path, so a
 * generated contract cannot reject anything the handler does not already resolve to a 404. When
 * one of them gains a body, query or header carrier the ratchet below fails, so it is validated
 * in the same change instead of drifting.
 */
const skippedOperations: Record<string, string> = {
  'DELETE:/api/v1/topics/:idOrSlug': 'unconditionally answers 405 and reads nothing',
  'DELETE:/api/v1/users/:idOrSlug': 'free-form id-or-slug path only',
  'GET:/api/v1/users/:idOrSlug': 'free-form id-or-slug path only',
  'GET:/api/v1/users/:id/vouch-context': 'free-form id-or-username path only',
  'GET:/api/v1/users/:idOrSlug/data-request': 'free-form id-or-slug path only',
  'POST:/api/v1/users/:idOrSlug/data-request': 'free-form id-or-slug path only',
  'GET:/api/v1/users/:idOrSlug/data-request/stream':
    'server-sent-event route: no response registration, so no query carrier; request_id is checked in the handler',
  'GET:/api/v1/users/:username/landing-page': 'free-form username path only',
  'GET:/api/v1/users/:username/landing-pages/:slug': 'free-form username and slug path only',
}

function resolve(schema: Schema | undefined): Schema {
  if (!schema) throw new Error('missing schema')
  const name = typeof schema.$ref === 'string' ? schema.$ref.split('/').at(-1) : undefined
  return name ? bundle.components[name]! : schema
}

function carriersOf(operation: string): Carriers {
  const carriers = bundle.operations[operation]
  if (!carriers) throw new Error(`${operation} has no request contract`)
  return carriers
}

describe('content route request contracts', () => {
  it.each(Object.entries(closedBodies))(
    '%s declares a closed body with the required keys',
    (operation, required) => {
      const schema = resolve(carriersOf(operation).body)
      expect(schema.type).toBe('object')
      expect(schema.additionalProperties).toBe(false)
      expect([...((schema.required as string[] | undefined) ?? [])].sort()).toEqual([...required])
    },
  )

  it.each(Object.entries(queryCarriers))('%s declares its query keys', (operation, keys) => {
    const properties = resolve(carriersOf(operation).query).properties as Record<string, Schema>
    expect(Object.keys(properties)).toEqual(expect.arrayContaining([...keys]))
  })

  it.each(limitOperations)('%s declares limit as an integer', operation => {
    const properties = resolve(carriersOf(operation).query).properties as Record<string, Schema>
    expect(properties.limit!.type).toBe('integer')
  })

  it('declares the story discussion idempotency key as a UUID header', () => {
    const header = carriersOf('POST:/api/v1/stories/:storyId/discussions').header
    const properties = header?.properties as Record<string, Schema>
    expect(properties['idempotency-key']).toMatchObject({ format: 'uuid', type: 'string' })
  })

  it.each(Object.entries(skippedOperations))('keeps %s free of validatable carriers (%s)', op => {
    const carriers = carriersOf(op)
    expect(Object.keys(carriers)).toEqual(['path'])
    const properties = (carriers.path as { properties: Record<string, Schema> }).properties
    for (const property of Object.values(properties)) expect(property).toEqual({ type: 'string' })
  })
})
