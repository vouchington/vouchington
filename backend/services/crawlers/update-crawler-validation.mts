import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'
import type { UpdateCrawlerUpdates } from './types.mts'

export async function validateCrawlerUpdates(
  updates: UpdateCrawlerUpdates,
  query: TransactionQuery,
): Promise<void> {
  if (updates.hostname_id && !isUUID(updates.hostname_id)) {
    throw createError(422, `Invalid hostname ID: ${updates.hostname_id}`)
  }
  if (updates.crawler_type) {
    assert(
      ['fetch', 'automation'].includes(updates.crawler_type),
      422,
      `Invalid crawler type: ${updates.crawler_type}`,
    )
  }
  if (updates.referral_program_id && !isUUID(updates.referral_program_id)) {
    throw createError(422, `Invalid referral program ID: ${updates.referral_program_id}`)
  }
  if (updates.referral_program_id) {
    const { rows } = await query<{ id: string }>(sql`
      /* validateCrawlerUpdateTopicReference */ SELECT id
      -- no-mistakes-disable-next-line postgres-required-predicates: keep merged rows so the existing update trigger preserves REST's 409; deleted topics still fail this lookup
      FROM topics WHERE id = ${updates.referral_program_id}::uuid AND deleted_at IS NULL
    `)
    if (rows.length === 0) throw createError(404, 'Topic not found')
  }
}
