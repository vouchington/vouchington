export { loadJsonMessages as loadServerMessages } from '@/lib/i18n/load-json-messages'

export async function loadedServerLocalizationRevision(): Promise<undefined> {
  return undefined
}

export async function ssrLocalizationRevisionHtmlProps(): Promise<Record<string, never>> {
  return {}
}
