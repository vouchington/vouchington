import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { format } from 'oxfmt'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stableStringify } from '@modules/utils/stable-stringify'
import {
  NO_MISTAKES_CATALOG_DATABASE,
  NO_MISTAKES_CATALOG_FILE,
  readNoMistakesCatalog,
  writeNoMistakesCatalog,
} from './no-mistakes-catalog.mts'
import type { PostgresCatalog, PostgresCatalogOptions } from 'no-mistakes'

const catalog: PostgresCatalog = {
  formatVersion: 2,
  coverage: 'complete',
  schema: 'public',
  currentDatabase: NO_MISTAKES_CATALOG_DATABASE,
  tables: {},
  functions: {},
  enums: { statuses: { values: ['open', 'closed'] } },
  views: {},
}

async function formatForTest(path: string, raw: string): Promise<string> {
  const result = await format(path, raw)
  if (result.errors.length > 0)
    throw new Error(result.errors.map(error => error.message).join('\n'))
  return result.code
}

describe('no-mistakes catalog', () => {
  const roots: string[] = []

  async function tempRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'no-mistakes-catalog-'))
    roots.push(root)
    return root
  }

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
  })

  it('asks for the complete public-schema catalog under the fixed application database name', async () => {
    const generate = vi.fn<(options: PostgresCatalogOptions) => Promise<PostgresCatalog>>(() =>
      Promise.resolve(catalog),
    )

    await expect(readNoMistakesCatalog(generate)).resolves.toBe(catalog)

    expect(generate).toHaveBeenCalledExactlyOnceWith({
      connectionEnv: 'DATABASE_URL',
      schema: 'public',
      coverage: 'complete',
      currentDatabase: 'voucha',
    })
  })

  it('writes the catalog in the same formatted, key-sorted form as schema.json', async () => {
    const root = await tempRoot()
    await writeNoMistakesCatalog({ catalog, root, format: formatForTest })

    const written = await readFile(join(root, NO_MISTAKES_CATALOG_FILE), 'utf8')
    expect(written).toBe(await formatForTest('catalog.json', stableStringify(catalog)))
    expect(JSON.parse(written)).toEqual(catalog)
    expect(await readdir(root)).toEqual([NO_MISTAKES_CATALOG_FILE])
  })

  it('accepts a matching catalog in check mode and leaves it untouched', async () => {
    const root = await tempRoot()
    await writeNoMistakesCatalog({ catalog, root, format: formatForTest })
    const path = join(root, NO_MISTAKES_CATALOG_FILE)
    const before = await readFile(path, 'utf8')

    await expect(
      writeNoMistakesCatalog({ catalog, root, format: formatForTest, check: true }),
    ).resolves.toBeUndefined()
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('reports a missing or changed catalog in check mode, naming the file to regenerate', async () => {
    const root = await tempRoot()
    const path = join(root, NO_MISTAKES_CATALOG_FILE)
    const check = () =>
      writeNoMistakesCatalog({ catalog, root, format: formatForTest, check: true })

    await expect(check()).rejects.toThrow(/db:snapshot:update/)
    await expect(check()).rejects.toThrow(path)
    await expect(readFile(path, 'utf8')).rejects.toThrow(/ENOENT/)

    await writeFile(path, '{"coverage":"complete"}\n')
    await expect(check()).rejects.toThrow(path)
  })

  it('replaces a stale catalog on update and no longer reports it', async () => {
    const root = await tempRoot()
    await writeFile(join(root, NO_MISTAKES_CATALOG_FILE), '{}\n')

    await writeNoMistakesCatalog({ catalog, root, format: formatForTest })

    await expect(
      writeNoMistakesCatalog({ catalog, root, format: formatForTest, check: true }),
    ).resolves.toBeUndefined()
  })

  it('does not follow a symlinked catalog when writing or checking', async () => {
    const root = await tempRoot()
    const sentinelRoot = await tempRoot()
    const sentinelPath = join(sentinelRoot, 'target.json')
    const sentinel = 'Do not touch this file.\n'
    await writeFile(sentinelPath, sentinel)
    await symlink(sentinelPath, join(root, NO_MISTAKES_CATALOG_FILE))

    for (const check of [false, true]) {
      await expect(
        writeNoMistakesCatalog({ catalog, root, format: formatForTest, check }),
      ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
    }
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(sentinel)
  })

  it('rejects a symlinked or missing snapshot root', async () => {
    const parent = await tempRoot()
    const target = await tempRoot()
    await symlink(target, join(parent, 'linked'))

    await expect(
      writeNoMistakesCatalog({ catalog, root: join(parent, 'linked'), format: formatForTest }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
    await expect(
      writeNoMistakesCatalog({ catalog, root: join(parent, 'absent'), format: formatForTest }),
    ).rejects.toThrow(/ENOENT/)
    expect(await readdir(target)).toEqual([])
  })

  it('rejects a catalog path that is not a regular file', async () => {
    const root = await tempRoot()
    await mkdir(join(root, NO_MISTAKES_CATALOG_FILE))

    await expect(
      writeNoMistakesCatalog({ catalog, root, format: formatForTest, check: true }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
  })

  it('keeps the committed catalog canonical, complete, and database-name independent', async () => {
    const committed = JSON.parse(
      await readFile(new URL(`./${NO_MISTAKES_CATALOG_FILE}`, import.meta.url), 'utf8'),
    ) as PostgresCatalog

    expect(committed).toMatchObject({
      coverage: 'complete',
      schema: 'public',
      currentDatabase: NO_MISTAKES_CATALOG_DATABASE,
    })
    await expect(
      writeNoMistakesCatalog({
        catalog: committed,
        root: new URL('.', import.meta.url).pathname,
        format: formatForTest,
        check: true,
      }),
    ).resolves.toBeUndefined()
  })
})
