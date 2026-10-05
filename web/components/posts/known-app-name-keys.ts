import type { MessageKey } from '@ts-shared/ui-messages'

/**
 * Display copy for the apps on the reviewed OAuth client allowlist
 * (`backend/services/oauth-authorization-server/known-clients.mts`). The API sends only the app's
 * `key`, a lowercase slug, and each client words it: this maps a key to the catalog alias holding
 * the app's name. A quoted alias written here counts as a reference to the route scan, so an entry
 * is added only together with its catalog copy.
 *
 * Adding an allowlist entry means adding its key and its copy here, through the localization CLI
 * for the copy, and later the same copy in the native catalogs. A key with no entry here renders
 * the plain "via API" or "via MCP" label, never the raw key.
 *
 * Empty because the allowlist is empty.
 */
export const KNOWN_APP_NAME_KEYS: ReadonlyMap<string, MessageKey> = new Map()
