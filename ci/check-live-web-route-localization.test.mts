import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { serializeCatalogTable } from '@vouchington/localization'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createRouteLocalizationFixture } from '../static-code-analysis/route-localization-fixtures.mts'
import {
  runRouteLocalizationCheck,
  runRouteLocalizationCommand,
} from './check-live-web-route-localization.mts'

describe('public route localization check', () => {
  it('checks a small real catalog through the same compilation and verification boundary as CI', async () => {
    const fixture = createRouteLocalizationFixture()
    expect(await runRouteLocalizationCheck({ ...fixture, expectedRouteCount: 10 })).toMatchObject({
      routeCount: 10,
      localeCount: 4,
    })
  })
  it('rejects missing consent copy through the real public checker', async () => {
    const fixture = createRouteLocalizationFixture()
    const catalog = {
      ...fixture.catalog,
      routeMembership: fixture.catalog.routeMembership!.filter(
        row => row.alias !== 'shared.oauth.consent.allow',
      ),
    }
    await expect(
      runRouteLocalizationCheck({ ...fixture, catalog, expectedRouteCount: 10 }),
    ).rejects.toThrow('Missing /oauth/consent: shared.oauth.consent.allow')
  })
  it('rejects a missing route instead of reporting a vacuous pass', async () => {
    const fixture = createRouteLocalizationFixture()
    const routes = fixture.routes.filter(route => route.pattern !== '/plans')
    await expect(
      runRouteLocalizationCheck({ ...fixture, routes, expectedRouteCount: 9 }),
    ).rejects.toThrow('Missing /plans route')
  })
})

async function directoryCommand(missing: boolean) {
  const fixture = createRouteLocalizationFixture()
  const root = await mkdtemp(join(tmpdir(), 'route-localization-command-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'translations'))
  const rows = missing
    ? fixture.sourceRouteRows.filter(
        row => !('alias' in row) || row.alias !== 'shared.oauth.consent.allow',
      )
    : fixture.sourceRouteRows
  for (const [name, values] of [
    ['copies', fixture.catalog.copies],
    ['aliases', fixture.catalog.aliases],
    ['routes', rows],
  ] as const)
    await writeFile(join(root, `${name}.json`), serializeCatalogTable(values))
  for (const [locale, rows] of Object.entries(fixture.catalog.translations))
    await writeFile(join(root, 'translations', `${locale}.json`), serializeCatalogTable(rows))
  // Missing membership changes its generated selector hash. Retain the original selected ID,
  // so this proves the command rejects an incomplete compiled route instead of accepting chrome.
  const selectors = join(root, 'selectors.input')
  await writeFile(
    selectors,
    JSON.stringify({ routes: fixture.routes, chromeSelector: fixture.chromeSelector }),
  )
  const labels = join(root, 'labels.input')
  await writeFile(labels, "'moderation.staffActions.fixture'")
  return runRouteLocalizationCommand([
    '--catalog',
    root,
    '--selectors',
    selectors,
    '--labels',
    labels,
    '--expected-routes',
    '10',
  ])
}

describe('normal route catalog directory inputs', () => {
  it('parses normal directory inputs and checks all route contracts', async () => {
    expect(await directoryCommand(false)).toMatchObject({ routeCount: 10, localeCount: 4 })
  })
  it('parses normal directory inputs and rejects missing copy', async () => {
    await expect(directoryCommand(true)).rejects.toThrow('Missing /oauth/consent:')
  })
})
