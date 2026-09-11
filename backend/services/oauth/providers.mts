// Relocated to @services/oauth-accounts (lower layer, shared by @services/oauth and all
// @services/oauth-* providers) to break the services/oauth <-> services/oauth-* workspace
// cycle. Kept as a re-export shim so existing relative imports within this package and
// external `@services/oauth`/`@services/oauth/providers` importers keep working.
export * from '@services/oauth-accounts/providers'
