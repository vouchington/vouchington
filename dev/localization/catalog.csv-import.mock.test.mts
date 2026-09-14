import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeCatalogTable } from '@vouchington/localization'

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    renameSync: vi.fn<typeof actual.renameSync>((...args) => actual.renameSync(...args)),
    rmSync: vi.fn<typeof actual.rmSync>((...args) => actual.rmSync(...args)),
    writeFileSync: vi.fn<typeof actual.writeFileSync>((...args) => actual.writeFileSync(...args)),
  }
})

const directories: string[] = []

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'csv-import-atomic-'))
  directories.push(root)
  const source = join(root, 'source')
  cpSync('localization/normalized-fixture', source, { recursive: true })
  return { csv: join(root, 'catalog.csv'), output: join(root, 'imported'), root, source }
}

function snapshot(directory: string): Record<string, string> {
  const files: Record<string, string> = {
    aliases: readFileSync(join(directory, 'aliases.json'), 'utf8'),
    copies: readFileSync(join(directory, 'copies.json'), 'utf8'),
  }
  if (existsSync(join(directory, 'routes.json')))
    files.routes = readFileSync(join(directory, 'routes.json'), 'utf8')
  for (const name of readdirSync(join(directory, 'translations')).toSorted())
    files[`translations/${name}`] = readFileSync(join(directory, 'translations', name), 'utf8')
  return files
}

function importTemps(parent: string): string[] {
  return readdirSync(parent).filter(name => name.includes('.csv-import-'))
}

function isStagingTranslations(from: unknown, to: unknown, destTranslations: string): boolean {
  const source = String(from)
  const leaf = source.split('/').pop() ?? ''
  return (
    resolve(String(to)) === destTranslations &&
    leaf === 'translations' &&
    source.includes('.csv-import-') &&
    !source.includes('.csv-import-backup-')
  )
}

describe('csv-import atomic replacement', () => {
  beforeEach(async () => {
    vi.resetModules()
    const fs = await import('node:fs')
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    vi.mocked(fs.writeFileSync).mockReset()
    vi.mocked(fs.renameSync).mockReset()
    vi.mocked(fs.rmSync).mockReset()
    vi.mocked(fs.writeFileSync).mockImplementation((...args) => actual.writeFileSync(...args))
    vi.mocked(fs.renameSync).mockImplementation((...args) => actual.renameSync(...args))
    vi.mocked(fs.rmSync).mockImplementation((...args) => actual.rmSync(...args))
  })

  afterEach(() => {
    directories.splice(0).forEach(directory => rmSync(directory, { force: true, recursive: true }))
  })

  it('preserves dest routes.json and leaves no staging dirs on success', async () => {
    const { csv, output, root, source } = makeWorkspace()
    const { runCatalogCli } = await import('./catalog.mts')
    await runCatalogCli(['csv-export', '--source', source, '--output', csv])
    await runCatalogCli(['csv-import', '--input', csv, '--output', output])
    const destRoutes = join(output, 'routes.json')
    writeFileSync(
      destRoutes,
      serializeCatalogTable([
        { consumer: 'web', selectorId: 'fixture.route.home', alias: 'fixture.nav.home' },
      ]),
    )
    const routesBytes = readFileSync(destRoutes)
    await runCatalogCli(['csv-import', '--input', csv, '--output', output])
    expect(readFileSync(destRoutes)).toEqual(routesBytes)
    expect(importTemps(root)).toEqual([])
  })

  it('leaves dest tables unchanged when staging writeFileSync fails', async () => {
    const { csv, output, root, source } = makeWorkspace()
    const fs = await import('node:fs')
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    const { runCatalogCli } = await import('./catalog.mts')
    await runCatalogCli(['csv-export', '--source', source, '--output', csv])
    await runCatalogCli(['csv-import', '--input', csv, '--output', output])
    writeFileSync(
      join(output, 'routes.json'),
      serializeCatalogTable([
        { consumer: 'web', selectorId: 'fixture.route.home', alias: 'fixture.nav.home' },
      ]),
    )
    const before = snapshot(output)
    vi.mocked(fs.writeFileSync).mockImplementation((path, data, options) => {
      if (String(path).includes('.csv-import-') && String(path).endsWith('copies.json'))
        throw new Error('injected staging write failure')
      return actual.writeFileSync(path, data, options)
    })
    await expect(runCatalogCli(['csv-import', '--input', csv, '--output', output])).rejects.toThrow(
      'injected staging write failure',
    )
    expect(snapshot(output)).toEqual(before)
    expect(importTemps(root)).toEqual([])
  })

  it('restores dest tables when promoting translations throws', async () => {
    const { csv, output, root, source } = makeWorkspace()
    const fs = await import('node:fs')
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    const { runCatalogCli } = await import('./catalog.mts')
    await runCatalogCli(['csv-export', '--source', source, '--output', csv])
    await runCatalogCli(['csv-import', '--input', csv, '--output', output])
    writeFileSync(
      join(output, 'routes.json'),
      serializeCatalogTable([
        { consumer: 'web', selectorId: 'fixture.route.home', alias: 'fixture.nav.home' },
      ]),
    )
    const before = snapshot(output)
    const destTranslations = resolve(join(output, 'translations'))
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (isStagingTranslations(from, to, destTranslations))
        throw new Error('injected promote failure')
      return actual.renameSync(from, to)
    })
    await expect(runCatalogCli(['csv-import', '--input', csv, '--output', output])).rejects.toThrow(
      'injected promote failure',
    )
    expect(snapshot(output)).toEqual(before)
    expect(importTemps(root)).toEqual([])
  })

  it('publishes no tables when first-import promote of translations throws', async () => {
    const { csv, output, root, source } = makeWorkspace()
    const fs = await import('node:fs')
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    const { runCatalogCli } = await import('./catalog.mts')
    await runCatalogCli(['csv-export', '--source', source, '--output', csv])
    const destTranslations = resolve(join(output, 'translations'))
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (isStagingTranslations(from, to, destTranslations))
        throw new Error('injected first-import promote failure')
      return actual.renameSync(from, to)
    })
    await expect(runCatalogCli(['csv-import', '--input', csv, '--output', output])).rejects.toThrow(
      'injected first-import promote failure',
    )
    expect(existsSync(join(output, 'copies.json'))).toBe(false)
    expect(existsSync(join(output, 'aliases.json'))).toBe(false)
    expect(existsSync(join(output, 'translations'))).toBe(false)
    expect(importTemps(root)).toEqual([])
  })

  it('leaves dest tables unchanged when parking aliases throws', async () => {
    const { csv, output, root, source } = makeWorkspace()
    const fs = await import('node:fs')
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    const { runCatalogCli } = await import('./catalog.mts')
    await runCatalogCli(['csv-export', '--source', source, '--output', csv])
    await runCatalogCli(['csv-import', '--input', csv, '--output', output])
    writeFileSync(
      join(output, 'routes.json'),
      serializeCatalogTable([
        { consumer: 'web', selectorId: 'fixture.route.home', alias: 'fixture.nav.home' },
      ]),
    )
    const before = snapshot(output)
    const destAliases = resolve(join(output, 'aliases.json'))
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (resolve(String(from)) === destAliases && String(to).includes('.csv-import-backup-'))
        throw new Error('injected park failure')
      return actual.renameSync(from, to)
    })
    await expect(runCatalogCli(['csv-import', '--input', csv, '--output', output])).rejects.toThrow(
      'injected park failure',
    )
    expect(snapshot(output)).toEqual(before)
    expect(importTemps(root)).toEqual([])
  })

  it('keeps the backup when restoring parked translations throws', async () => {
    const { csv, output, root, source } = makeWorkspace()
    const fs = await import('node:fs')
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    const { runCatalogCli } = await import('./catalog.mts')
    await runCatalogCli(['csv-export', '--source', source, '--output', csv])
    await runCatalogCli(['csv-import', '--input', csv, '--output', output])
    const destTranslations = resolve(join(output, 'translations'))
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (isStagingTranslations(from, to, destTranslations))
        throw new Error('injected promote failure')
      if (resolve(String(to)) === destTranslations && String(from).includes('.csv-import-backup-'))
        throw new Error('injected restore failure')
      return actual.renameSync(from, to)
    })
    await expect(runCatalogCli(['csv-import', '--input', csv, '--output', output])).rejects.toThrow(
      'injected promote failure',
    )
    expect(importTemps(root).some(name => name.includes('.csv-import-backup-'))).toBe(true)
  })

  it('keeps a published catalog when cleanup rmSync throws', async () => {
    const { csv, output, source } = makeWorkspace()
    const fs = await import('node:fs')
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    const { runCatalogCli } = await import('./catalog.mts')
    await runCatalogCli(['csv-export', '--source', source, '--output', csv])
    vi.mocked(fs.rmSync).mockImplementation((path, options) => {
      if (String(path).includes('.csv-import-')) throw new Error('injected cleanup failure')
      return actual.rmSync(path, options)
    })
    await expect(
      runCatalogCli(['csv-import', '--input', csv, '--output', output]),
    ).resolves.toBeUndefined()
    expect(existsSync(join(output, 'copies.json'))).toBe(true)
    expect(existsSync(join(output, 'aliases.json'))).toBe(true)
    expect(existsSync(join(output, 'translations'))).toBe(true)
  })
})
