import type { SerializableCatalog } from '@ts-shared/ui-messages/catalog-bootstrap'
import { escapeInlineScriptJson } from './inline-script-json'

export interface UiMessagesBootstrap {
  locale: string
  catalog: SerializableCatalog
}

/**
 * Serializes the active locale's resolved JSON-safe catalog into a `window.__UI_MESSAGES__`
 * inline bootstrap script, mirroring
 * `serializeImageOriginBootstrapScript`/`serializeRuntimePublicConfigBootstrapScript`. Read
 * client-side by `use-translations.tsx`'s module-scope bootstrap, which seeds the complete client
 * catalog cache before the first `useTranslations()` consumer renders — see that file's doc
 * comment for why this closes the hydration pop-in window instead of only narrowing it.
 */
export function serializeUiMessagesBootstrapScript(bootstrap: UiMessagesBootstrap): string {
  const serialized = escapeInlineScriptJson(JSON.stringify(bootstrap))
  return `window.__UI_MESSAGES__=${serialized}`
}
