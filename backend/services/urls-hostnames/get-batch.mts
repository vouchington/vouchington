import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import { isHostname } from '@ts-shared/utils/urls'
import {
  queryOrderedIdentifierBatch,
  type NormalizedBatchIdentifier,
  type OrderedBatchPartition,
} from '@services/batch-lookup'
import type { ViewHostname } from './types.mts'
import createError from 'http-errors'

const urlHostnameBatchPartitions: readonly OrderedBatchPartition<'id' | 'hostname'>[] = [
  { cteName: 'id_input', sqlType: 'uuid', type: 'id' },
  { cteName: 'hostname_input', sqlType: 'text', type: 'hostname' },
]

export const getUrlHostnamesByAnyBatch = async (
  idsOrHostnames: string[],
  options: QueryOptions = {},
): Promise<Array<ViewHostname | null>> =>
  queryOrderedIdentifierBatch<ViewHostname, 'id' | 'hostname', QueryOptions>(
    idsOrHostnames,
    options,
    {
      normalize: normalizeUrlHostnameBatchIdentifier,
      partitions: urlHostnameBatchPartitions,
      statementBody: urlHostnameBatchStatementBody,
      readRows: readUrlHostnameBatchRows,
    },
  )

function normalizeUrlHostnameBatchIdentifier(
  input: string,
): Omit<NormalizedBatchIdentifier<'id' | 'hostname'>, 'index'> {
  const trimmed = input.trim()
  const normalized = trimmed.toLowerCase()

  if (isUUID(trimmed)) {
    return { value: trimmed, type: 'id' }
  }
  if (isHostname(normalized)) {
    return { value: normalized, type: 'hostname' }
  }
  throw createError(422, `Invalid URL hostname identifier: ${input}`)
}

function urlHostnameBatchStatementBody(inputCtes: string): string {
  return `${inputCtes},
    id_lookups AS (
      SELECT uh.id, id_input.input_order
      FROM url_hostnames uh
      JOIN id_input ON uh.id = id_input.input_value
    ),
    hostname_lookups AS (
      SELECT uh.id, hostname_input.input_order
      FROM url_hostnames uh
      JOIN hostname_input ON uh.hostname = hostname_input.input_value
    ),
    combined_ids AS (
      SELECT id, input_order FROM id_lookups
      UNION
      SELECT id, input_order FROM hostname_lookups
    )
    SELECT vuh.*, ci.input_order
    FROM view_url_hostnames vuh
    JOIN combined_ids ci ON ci.id = vuh.id
    ORDER BY ci.input_order
  `
}

async function readUrlHostnameBatchRows(
  statementBody: string,
  values: unknown[],
  options: QueryOptions,
): Promise<ReadonlyArray<ViewHostname & { input_order: number }>> {
  const statement = `/* getUrlHostnamesByAnyBatch */
    WITH ${statementBody}`
  const { rows } = await read<ViewHostname & { input_order: number }>(statement, values, options)
  return rows
}
