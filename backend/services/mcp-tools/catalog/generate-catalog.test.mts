import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCatalogGeneration } from './generate-catalog.mts'

const markdown = 'docs/overview/architecture/agent-tools/catalog.md'
const artifacts = ['api-fixtures/v1/mcp.json', markdown, 'backend/tools/manifest.json']
let root: string

describe('catalog generation with owned filesystem resources', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mcp-catalog-'))
    await Promise.all(artifacts.map(path => mkdir(join(root, path, '..'), { recursive: true })))
    await copyFile(
      fileURLToPath(new URL(`../../../../${markdown}`, import.meta.url)),
      join(root, markdown),
    )
  })
  afterEach(() => rm(root, { recursive: true, force: true }))

  it('writes canonical artifacts then verifies them without rewriting and closes its resource', async () => {
    const handle = await open(join(root, 'owned-resource'), 'w')
    await runCatalogGeneration([], { root, closeResources: [() => handle.close()] })
    expect(handle.fd).toBe(-1)
    await Promise.all(artifacts.map(path => utimes(join(root, path), new Date(0), new Date(0))))
    const times = await Promise.all(
      artifacts.map(async path => (await stat(join(root, path), { bigint: true })).mtimeNs),
    )
    const before = await Promise.all(artifacts.map(path => readFile(join(root, path), 'utf8')))
    await runCatalogGeneration(['--', '--check'], { root, closeResources: [] })
    expect(await Promise.all(artifacts.map(path => readFile(join(root, path), 'utf8')))).toEqual(
      before,
    )
    expect(
      await Promise.all(
        artifacts.map(async path => (await stat(join(root, path), { bigint: true })).mtimeNs),
      ),
    ).toEqual(times)
    expect(JSON.parse(before[0]!).servers.length).toBeGreaterThan(0)
  })

  it('rejects stale artifacts without rewriting any file', async () => {
    await runCatalogGeneration([], { root, closeResources: [] })
    await writeFile(join(root, artifacts[0]!), '{}\n')
    await Promise.all(artifacts.map(path => utimes(join(root, path), new Date(0), new Date(0))))
    const times = await Promise.all(
      artifacts.map(async path => (await stat(join(root, path), { bigint: true })).mtimeNs),
    )
    const before = await Promise.all(artifacts.map(path => readFile(join(root, path), 'utf8')))
    await expect(runCatalogGeneration(['--check'], { root, closeResources: [] })).rejects.toThrow(
      'Stale MCP catalog artifacts',
    )
    expect(await Promise.all(artifacts.map(path => readFile(join(root, path), 'utf8')))).toEqual(
      before,
    )
    expect(
      await Promise.all(
        artifacts.map(async path => (await stat(join(root, path), { bigint: true })).mtimeNs),
      ),
    ).toEqual(times)
  })

  it.each([['--unknown'], ['--check', '--check']])(
    'rejects invalid arguments %j and closes its resource',
    async (...args) => {
      const handle = await open(join(root, 'owned-resource'), 'w')
      await expect(
        runCatalogGeneration(args, { root, closeResources: [() => handle.close()] }),
      ).rejects.toThrow('Usage:')
      expect(handle.fd).toBe(-1)
      await expect(readFile(join(root, artifacts[0]!), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      })
    },
  )

  it('reports cleanup failure after successful generation', async () => {
    await expect(
      runCatalogGeneration([], {
        root,
        closeResources: [() => unlink(join(root, 'missing-resource'))],
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(
      JSON.parse(await readFile(join(root, artifacts[0]!), 'utf8')).servers.length,
    ).toBeGreaterThan(0)
  })

  it('preserves generation and cleanup errors while still closing every resource', async () => {
    const handle = await open(join(root, 'owned-resource'), 'w')
    const result = runCatalogGeneration(['--unknown'], {
      root,
      closeResources: [() => handle.close(), () => unlink(join(root, 'missing-resource'))],
    })
    await expect(result).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [
        expect.objectContaining({ message: expect.stringContaining('Usage:') }),
        expect.objectContaining({ code: 'ENOENT' }),
      ],
    })
    expect(handle.fd).toBe(-1)
  })
})
