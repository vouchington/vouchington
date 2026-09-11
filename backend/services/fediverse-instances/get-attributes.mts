import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import type { NodeInfoDocument } from '@services/fediverse-search/adapters/instance-classification'
import type { FediverseIntegrationStatus } from './integration-status.mts'

export type FediverseInstanceAttributes = {
  software: string | null
  protocol: string | null
  nodeinfo_software_version: string | null
  total_users: number | null
  monthly_active_users: number | null
  open_registrations: boolean | null
  nodeinfo_raw: NodeInfoDocument | null
  integration_status: FediverseIntegrationStatus
}

export async function getFediverseInstanceAttributes(
  topicId: string,
): Promise<FediverseInstanceAttributes | null> {
  const { rows } = await read(sql`/* getFediverseInstanceAttributes */
    SELECT
      software,
      protocol,
      nodeinfo_software_version,
      total_users,
      monthly_active_users,
      open_registrations,
      nodeinfo_raw,
      integration_status
    FROM topics__fediverse_instances
    WHERE topic_id = ${topicId}
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function getFediverseInstanceAttributesByIdBatch(
  topicIds: string[],
  options: QueryOptions = {},
): Promise<Array<FediverseInstanceAttributes | null>> {
  if (topicIds.length === 0) {
    return []
  }

  for (const topicId of topicIds) {
    if (!isUUID(topicId)) {
      throw createError(422, `Invalid topic ID: ${topicId}`)
    }
  }

  const positions = topicIds.map((_, index) => index)

  const { rows } = await read(
    `/* getFediverseInstanceAttributesByIdBatch */
    WITH input_data AS (
      SELECT unnest($1::uuid[]) AS input_value,
             unnest($2::int[]) AS input_order
    )
    SELECT
      tfi.software,
      tfi.protocol,
      tfi.nodeinfo_software_version,
      tfi.total_users,
      tfi.monthly_active_users,
      tfi.open_registrations,
      tfi.nodeinfo_raw,
      tfi.integration_status,
      input_data.input_order
    FROM topics__fediverse_instances tfi
    JOIN input_data ON tfi.topic_id = input_data.input_value
    ORDER BY input_data.input_order
  `,
    [topicIds, positions],
    options,
  )

  const results: Array<FediverseInstanceAttributes | null> = new Array(topicIds.length).fill(null)

  for (const row of rows) {
    const { input_order, ...attributes } = row
    results[input_order] = attributes as FediverseInstanceAttributes
  }

  return results
}
