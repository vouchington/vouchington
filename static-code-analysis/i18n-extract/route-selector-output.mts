export function renderSource(
  chromeSelector: string,
  routes: readonly {
    pattern: string
    selectorId: string
    aliases: readonly string[]
  }[],
): string {
  return [
    '// GENERATED FILE - do not edit by hand.',
    '// Regenerate: node static-code-analysis/i18n-extract/route-selector-map.mts',
    '// Verify:     node static-code-analysis/i18n-extract/route-selector-map.mts --check',
    `export const WEB_CHROME_SELECTOR = ${JSON.stringify(chromeSelector)}`,
    '// oxfmt-ignore',
    'export const ROUTE_SELECTORS = [',
    ...routes.map(
      route =>
        `  { pattern: ${JSON.stringify(route.pattern)}, selectorId: ${JSON.stringify(route.selectorId)}, hasMembership: ${route.aliases.length > 0} },`,
    ),
    ']',
    '',
  ].join('\n')
}
