import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import { isHostname } from '@ts-shared/utils/urls'
import {
  buildOrderedInputCtes,
  normalizeBatchIdentifiers,
  partitionBatchIdentifiers,
  scatterOrderedRows,
} from '@services/batch-lookup'
import type { ViewHostname } from './types.mts'
import createError from 'http-errors'

export const getUrlHostnamesByAnyBatch = async (
  idsOrHostnames: string[],
  options: QueryOptions = {},
): Promise<Array<ViewHostname | null | undefined>> => {
  if (idsOrHostnames.length === 0) {
    return []
  }

  const normalizedInputs = normalizeBatchIdentifiers(idsOrHostnames, input => {
    const trimmed = input.trim()
    const normalized = trimmed.toLowerCase()

    if (isUUID(trimmed)) {
      return { value: trimmed, type: 'id' }
    }
    if (isHostname(normalized)) {
      return { value: normalized, type: 'hostname' }
    }
    throw createError(422, `Invalid URL hostname identifier: ${input}`)
  })

  const partitions = partitionBatchIdentifiers(normalizedInputs)
  const inputCtes = buildOrderedInputCtes([
    { cteName: 'id_input', sqlType: 'uuid', inputs: partitions.get('id') ?? [] },
    { cteName: 'hostname_input', sqlType: 'text', inputs: partitions.get('hostname') ?? [] },
  ])

  const { rows } = await read(
    `/* getUrlHostnamesByAnyBatch */
    WITH ${inputCtes.ctes},
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
  `,
    inputCtes.values,
    options,
  )

  return scatterOrderedRows(idsOrHostnames.length, rows, row => {
    const { input_order: _input_order, ...hostnameData } = row
    return hostnameData as ViewHostname
  })
}
