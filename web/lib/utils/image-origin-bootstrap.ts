import { escapeInlineScriptJson } from './inline-script-json'
import { normalizeImageOrigin } from './image-origin'

export function serializeImageOriginBootstrapScript(
  imageOrigin: string | undefined,
): string | null {
  if (!imageOrigin) return null

  const serializedOrigin = escapeInlineScriptJson(JSON.stringify(normalizeImageOrigin(imageOrigin)))

  return `window.__IMAGE_ORIGIN__=${serializedOrigin}`
}
