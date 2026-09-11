/**
 * Factory function for creating pagination parsers
 */

import type { PaginationConfig } from './types.mts'
import { PaginationParser } from './parser.mts'

/**
 * Create a configured pagination parser
 *
 * @example
 * ```ts
 * const parser = createPaginationParser({
 *   cursor: {
 *     type: 'simple',
 *     paramName: 'after',
 *   },
 *   limit: {
 *     min: 1,
 *     max: 100,
 *     default: 20,
 *   },
 *   filters: {
 *     postTypes: true,
 *     timeRange: true,
 *     sort: ['new', 'best', 'ranking'],
 *   },
 * })
 *
 * // In route handler:
 * const options = parser.parse(ctx.query)
 * const result = await service(ctx.state.user, options)
 * ctx.body = { results: result.results, page_info: result.page_info }
 * ```
 */
export function createPaginationParser<const TConfig extends PaginationConfig>(
  config: TConfig,
): PaginationParser<TConfig> {
  return new PaginationParser(config)
}
