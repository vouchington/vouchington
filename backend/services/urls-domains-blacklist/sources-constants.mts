// Relocated to @voucha/types (pure config data, no service dependencies) so that
// backend/data-stores/psql/config-driven seed generators can use it without creating
// a data-stores -> services workspace cycle. Re-exported here for call-site stability.
export * from '@voucha/types/entities/domain-blacklist-source'
