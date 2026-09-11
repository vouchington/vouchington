// JWT stale-marker logic lives in @data-stores/valkey/jwt-stale (a thin Valkey
// op with no service-layer dependencies). Re-exported here for call-site
// stability — do not reintroduce the implementation in this file.
export {
  markJwtStale,
  markJwtStaleBatch,
  isJwtStale,
  clearJwtStale,
  clearJwtStaleIfCurrent,
} from '@data-stores/valkey/jwt-stale'
