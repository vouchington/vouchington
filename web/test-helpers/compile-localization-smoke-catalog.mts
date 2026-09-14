import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import type { LocalizationCatalog } from '@vouchington/localization'
import { compileLocalizationSqlite, loadCatalogDirectory } from '@vouchington/localization-compiler'
import { ROUTE_SELECTORS, WEB_CHROME_SELECTOR } from '../lib/i18n/route-selectors.generated.mts'

const output = process.argv[2]
if (!output) throw new TypeError('Missing smoke catalog output path')

const homepage = ROUTE_SELECTORS.find(route => route.pattern === '/')
if (!homepage) throw new TypeError('Missing homepage route selectors')
const selectorIds = [WEB_CHROME_SELECTOR, homepage.selectorId]
const { catalog } = await loadCatalogDirectory('localization/catalog')
const routeSelectors = (catalog.routeSelectors ?? []).filter(
  row => row.consumer === 'web' && selectorIds.includes(row.selectorId),
)
for (const selectorId of selectorIds) {
  if (!routeSelectors.some(row => row.selectorId === selectorId))
    throw new TypeError(`Homepage smoke catalog has no registered selector for ${selectorId}`)
}
const routeMembership = (catalog.routeMembership ?? []).filter(
  row => row.consumer === 'web' && selectorIds.includes(row.selectorId),
)
const aliases = catalog.aliases.filter(
  row =>
    row.consumer === 'web' && routeMembership.some(membership => membership.alias === row.alias),
)
const copyIds = new Set(aliases.map(alias => alias.copyId))
const copies = catalog.copies.filter(copy => copyIds.has(copy.id))
if (copies.length === 0) throw new TypeError('Homepage smoke catalog has no web copy')
const smokeCatalog: LocalizationCatalog = {
  copies,
  aliases,
  translations: Object.fromEntries(
    Object.entries(catalog.translations).map(([locale, rows]) => [
      locale,
      rows.filter(row => copyIds.has(row.id)),
    ]),
  ),
  routeMembership,
  routeSelectors,
  tags: Object.fromEntries(
    Object.entries(catalog.tags ?? {}).filter(([copyId]) => copyIds.has(copyId)),
  ),
}

const resolvedOutput = resolve(output)
const previousTmpdir = process.env.TMPDIR
mkdirSync(dirname(resolvedOutput), { recursive: true })
process.env.TMPDIR = dirname(resolvedOutput)
try {
  process.stdout.write(`Compiling ${copies.length} homepage messages...\n`)
  process.stdout.write(`${compileLocalizationSqlite(smokeCatalog, resolvedOutput)}\n`)
} finally {
  process.env.TMPDIR = previousTmpdir ?? tmpdir()
}
