/**
 * Unified pagination module
 * Factory pattern for creating pagination parsers with declarative configuration
 */

// Re-export types
export type {
  ScoreCursor,
  ScopedPreciseTimestampCursor,
  ScopedTierPreciseUuidCursor,
  NameCursor,
} from './types.mts'

export * from './query-contract.mts'

// Re-export cursor utilities
export * from './cursors.mts'
export {
  decodeScopedPreciseTimestampCursor,
  decodeScopedTierPreciseNameCursor,
  decodeScopedTierPreciseUuidCursor,
  encodeScopedPreciseTimestampCursor,
  encodeScopedTierPreciseNameCursor,
  encodeScopedTierPreciseUuidCursor,
  isScopedPreciseTimestampCursor,
} from '@vouchington/pagination'
export { parseBoundedIntegerLimit } from './parser.mts'

// Re-export filter validators (for service layer use)
export * from './filters.mts'

// Re-export factory function
export * from './factory.mts'
export * from './presets.mts'
