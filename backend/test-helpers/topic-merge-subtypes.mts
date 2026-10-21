import { write } from '@data-stores/psql'

export async function seedTopicMergeLifetimeStatuses(input: {
  sourceId: string
  destinationId: string
  sourceOwnerId: string
  destinationOwnerId?: string
}): Promise<void> {
  await write(
    `/* seedTopicMergeLifetimeStatuses */ INSERT INTO rewards_program_status_topics (topic_id, order_index)
    VALUES ($1::uuid, 1), ($2::uuid, 9)`,
    [input.sourceId, input.destinationId],
  )
  await write(
    `/* seedTopicMergeLifetimeStatuses */ INSERT INTO rewards_program_status_topics (topic_id, lifetime_version_id)
    VALUES ($1::uuid, $2::uuid)`,
    [input.sourceOwnerId, input.sourceId],
  )
  if (input.destinationOwnerId)
    await write(
      `/* seedTopicMergeLifetimeStatuses */ INSERT INTO rewards_program_status_topics (topic_id, lifetime_version_id)
    VALUES ($1::uuid, $2::uuid)`,
      [input.destinationOwnerId, input.destinationId],
    )
}

export async function getTopicMergeStatusExtensions(topicIds: string[]) {
  const { rows } = await write<{
    topic_id: string
    lifetime_version_id: string | null
    order_index: number
  }>(
    `/* getTopicMergeStatusExtensions */ SELECT topic_id, lifetime_version_id, order_index
      FROM rewards_program_status_topics WHERE topic_id = ANY($1::uuid[]) ORDER BY topic_id`,
    [topicIds],
  )
  return rows
}

export async function seedTopicMergeSpendingFacet(sourceId: string, destinationId?: string) {
  await write(
    `/* seedTopicMergeSpendingFacet */ INSERT INTO spending_category_topics (topic_id, default_spending_frequency)
    VALUES ($1::uuid, 'monthly')`,
    [sourceId],
  )
  if (destinationId)
    await write(
      `/* seedTopicMergeSpendingFacet */ INSERT INTO spending_category_topics (topic_id, default_spending_frequency)
    VALUES ($1::uuid, 'annually')`,
      [destinationId],
    )
  const { rows } = await write<{ id: string }>(
    `/* seedTopicMergeSpendingFacet */ WITH owner AS (INSERT INTO individuals DEFAULT VALUES RETURNING id)
    INSERT INTO spending_entries (spending_category_topic_id, amount_minor_units, currency_code, individual_id)
    SELECT $1::uuid, 100, 'usd', id FROM owner RETURNING id`,
    [sourceId],
  )
  return rows[0]!.id
}

export async function getTopicMergeSpendingFacet(topicIds: string[], entryId: string) {
  const [facets, entries] = await Promise.all([
    write<{ topic_id: string; default_spending_frequency: string }>(
      `/* getTopicMergeSpendingFacet */ SELECT topic_id, default_spending_frequency FROM spending_category_topics WHERE topic_id = ANY($1::uuid[])`,
      [topicIds],
    ),
    write<{ spending_category_topic_id: string }>(
      `/* getTopicMergeSpendingFacet entry */ SELECT spending_category_topic_id FROM spending_entries WHERE id = $1::uuid`,
      [entryId],
    ),
  ])
  return { facets: facets.rows, topicId: entries.rows[0]!.spending_category_topic_id }
}

export async function seedTopicMergeRetailerCollision(
  sourceId: string,
  destinationId: string,
): Promise<void> {
  await write(
    `/* seedTopicMergeRetailerCollision */ WITH extensions AS (
    INSERT INTO retailer_topics (topic_id) VALUES ($1::uuid), ($2::uuid)
  ) INSERT INTO retailer_countries (retailer_topic_id, country_id)
    SELECT topic_id, country.id FROM unnest(ARRAY[$1::uuid, $2::uuid]) AS topic(topic_id)
    CROSS JOIN countries country WHERE country.code = 'US'`,
    [sourceId, destinationId],
  )
}
