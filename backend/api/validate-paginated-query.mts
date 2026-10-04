import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import type { Context } from '@jongleberry/api-server'
import type { QueryContract, PaginationRuntimeLimitBounds } from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { validateRequestContract } from './response-helpers.mts'

type ParsedPagination = { limit: number; after?: string }

/** The subset of a pagination parser that request validation needs. */
export type ValidatablePaginationParser<TParsed extends ParsedPagination> = {
  readonly queryContract: QueryContract
  parse(query: Record<string, unknown>, bounds?: PaginationRuntimeLimitBounds): TParsed
}

type ValidatePaginatedRequestOptions = {
  runtimeLimitBounds?: PaginationRuntimeLimitBounds
  /** Also validate the declared path parameters in the same contract call. */
  path?: boolean
  /** Query contracts declared beside the parser through `apiQuery(operation, parser, ...extra)`. */
  extraQueryContracts?: readonly QueryContract[]
  /** Query keys the route reads itself and that must not reach the contract validator. */
  ignoredKeys?: readonly string[]
}

/**
 * Runs the pagination parser (which keeps its own 400 for a malformed `limit` or cursor), then
 * validates the query against the operation's generated request contract before any service call.
 * The registry does not coerce, so wire strings are converted by `prepareQueryForValidation`, and
 * `limit`/`after` are overwritten with the parser's clamped values: the parser is the one place
 * that defines the out-of-range limit behavior, so the contract only rejects wrong types and
 * unknown shapes. Call this after the route's authentication and authorization steps.
 */
export function parseAndValidatePaginatedRequest<TParsed extends ParsedPagination>(
  ctx: Context,
  operation: string,
  parser: ValidatablePaginationParser<TParsed>,
  options: ValidatePaginatedRequestOptions = {},
): TParsed {
  const parsed = parseRuntimePagination(parser, ctx.query, options.runtimeLimitBounds)
  const queryContract = Object.assign(
    {},
    parser.queryContract,
    ...(options.extraQueryContracts ?? []),
  )
  const query = prepareQueryForValidation(ctx.query, queryContract, options.ignoredKeys)
  if (ctx.query.limit !== undefined) query.limit = parsed.limit
  if (parsed.after !== undefined) query.after = parsed.after
  validateRequestContract(ctx, operation, options.path ? { path: ctx.params, query } : { query })
  return parsed
}
