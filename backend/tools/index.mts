// Per backend/tools/CLAUDE.md, tool entries are imported by path
// (e.g. `@voucha/tools/search-posts`), not via this barrel — `export *`
// would not re-export their default exports anyway. This barrel only
// re-exports the shared `Tool` type used by agent shims.
export * from './types.mts'
