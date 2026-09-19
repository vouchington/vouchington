export { loadJsonMessages as loadServerMessages } from '@/lib/i18n/load-json-messages'

export async function loadedServerLocalizationRevision(): Promise<undefined> {
  return undefined
}

export function ssrLocalizationRevisionHtmlProps(): Record<string, never> {
  return {}
}
