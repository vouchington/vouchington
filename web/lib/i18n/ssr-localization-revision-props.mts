export const SSR_LOCALIZATION_REVISION_ATTRIBUTE = 'data-localization-ssr-revision'

export function ssrLocalizationRevisionProps(
  nodeEnv: string | undefined,
  revision: string | undefined,
): { [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: string } | Record<string, never> {
  if (nodeEnv !== 'development' || revision === undefined || revision === '') return {}
  return { [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: revision }
}
