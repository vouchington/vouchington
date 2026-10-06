import { beginTransaction, withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { v7 as uuidv7 } from 'uuid'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { validateCommunitySlug, generateCommunitySlug } from './slugs.mts'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import type { CommunityWithOwner } from './get.mts'
import { validateCreateCommunityInput } from './create-validation.mts'
import { insertCommunity } from './create-insert.mts'
import type { CreateCommunityInput } from './create-types.mts'
export type { CreateCommunityInput } from './create-types.mts'

/**
 * Creates a community. With `queryOptions.query` it joins the caller's transaction, which then
 * owns the commit and everything that follows it; otherwise it runs and commits its own.
 */
export async function createCommunity(
  currentUserId: string,
  provenance: ContentProvenance,
  input: CreateCommunityInput,
  queryOptions?: QueryOptions,
): Promise<CommunityWithOwner> {
  validateCreateCommunityInput(input)

  const id = uuidv7()
  const slug = input.slug
    ? validateCommunitySlug(input.slug)
    : generateCommunitySlug(input.name, id)
  const defaultLanguage = normalizeContentLanguageTag(input.default_language ?? null)
  const insert = { id, slug, defaultLanguage, currentUserId, provenance, input }

  try {
    if (queryOptions?.query)
      return await withTransactionOptions(queryOptions, query => insertCommunity(query, insert))
    await using query = await beginTransaction()
    const community = await insertCommunity(query, insert)
    await query.commit()
    return community
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw createHttpError(409, `Slug "${slug}" is already taken`)
    }
    throw err
  }
}

export { validateCreateCommunityInput } from './create-validation.mts'
