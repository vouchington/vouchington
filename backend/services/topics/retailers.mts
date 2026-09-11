import { read, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { Topic } from './types.mts'
import { currentUserCanUpdateTopic } from './authorization.mts'
import { upsertTopicAttributes } from './upsert-attributes.mts'

type RetailerAttributes = Record<string, never>

type Country = {
  id: number
  name: string
  code: string
}

// `retailer` is an additive facet (see docs/requirements/content/TOPICS.md § Type vs facet).
// Any topic may carry it; there is no topic_type eligibility restriction.

export async function getRetailerAttributes(topic: Topic): Promise<RetailerAttributes | null> {
  const { rows } = await read(sql`/* getRetailerAttributes */
    SELECT topic_id
    FROM topics__retailers
    WHERE topic_id = ${topic.id}
    LIMIT 1
  `)
  return rows[0] ? {} : null
}

export async function updateRetailerAttributes(
  currentUser: PrivateUser | null,
  topic: Topic,
): Promise<RetailerAttributes | null> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')

  return await upsertTopicAttributes<RetailerAttributes>('topics__retailers', topic.id, [], [])
}

export async function getRetailerCountries(topic: Topic): Promise<Country[]> {
  const { rows } = await read(sql`/* getRetailerCountries */
    SELECT c.id, c.name, c.code
    FROM countries c
    JOIN retailer_countries rc ON rc.country_id = c.id
    WHERE rc.retailer_id = ${topic.id}
    ORDER BY c.name ASC
  `)
  return rows as Country[]
}

export async function updateRetailerCountries(
  currentUser: PrivateUser | null,
  topic: Topic,
  countryIds: number[],
): Promise<Country[]> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  assert(
    countryIds.every(id => Number.isInteger(id) && id > 0),
    422,
    'country_ids must contain positive integers',
  )

  // Ensure the extension row exists before inserting retailer_countries (FK dependency)
  await upsertTopicAttributes<RetailerAttributes>('topics__retailers', topic.id, [], [])

  const uniqueCountryIds = [...new Set(countryIds)]

  if (uniqueCountryIds.length > 0) {
    const { rows } = await read(sql`/* updateRetailerCountries validate */
      SELECT id FROM countries WHERE id = ANY(${uniqueCountryIds}::int[])
    `)
    const foundIds = new Set(rows.map((r: { id: number }) => r.id))
    for (const id of uniqueCountryIds) {
      assert(foundIds.has(id), 422, `country_ids contains unknown country: ${id}`)
    }
  }

  await using query = await beginTransaction()
  await query(sql`/* updateRetailerCountries delete */
    DELETE FROM retailer_countries
    WHERE retailer_id = ${topic.id}
  `)

  if (uniqueCountryIds.length > 0) {
    await query(sql`/* updateRetailerCountries insert */
      INSERT INTO retailer_countries (retailer_id, country_id)
      SELECT ${topic.id}, UNNEST(${uniqueCountryIds}::int[])
    `)
  }
  await query.commit()

  return getRetailerCountries(topic)
}
