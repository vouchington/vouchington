import type { MessageKey, Translator } from '@ts-shared/ui-messages'
import type { Post } from '@/types/posts'
import { KNOWN_APP_NAME_KEYS } from './known-app-name-keys'

/**
 * The public "via API", "via MCP" or "via {app}" wording, composed from the facts the server sends
 * (`{ via, app }`), which are keys and identifiers rather than text to show. A known app is named by
 * its catalog copy. A key with no copy falls back to the channel, so a raw key is never rendered.
 */
export function publicProvenanceLabel(
  t: Translator,
  provenance: NonNullable<Post['provenance']>,
  knownAppNameKeys: ReadonlyMap<string, MessageKey> = KNOWN_APP_NAME_KEYS,
): string {
  const channel =
    provenance.via === 'mcp' ? t('shared.provenance.viaMcp') : t('shared.provenance.viaApi')
  const { app } = provenance
  if (app === null) return channel
  if (app.kind === 'hostname') return t('shared.provenance.viaApp', { app: app.hostname })
  if (app.kind === 'verified') return t('shared.provenance.viaApp', { app: app.client_name })
  const nameKey = knownAppNameKeys.get(app.key)
  return nameKey === undefined ? channel : t('shared.provenance.viaApp', { app: t(nameKey) })
}
