import {
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
import type { Tool } from '@services/openai-agents/tool-types'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCatalogGeneration } from './generate-catalog.mts'

const markdown = 'docs/overview/architecture/agent-tools/catalog.md'
const artifacts = ['api-fixtures/v1/mcp.json', markdown]
const tools: readonly Tool[] = [
  {
    schema: {
      name: 'tiny_read',
      type: 'function',
      description: 'A tiny read',
      parameters: null,
      strict: null,
    },
    function: (_user: unknown) => () => ({}),
    meta: {
      surfaces: ['mcp'],
      title: 'Tiny Read',
      api: null,
      requiredScopes: { mcp: ['topics:read'] },
      annotations: { readOnlyHint: true },
      outputSchema: { type: 'object', properties: {} },
    },
  } as unknown as Tool,
]
let root: string

describe('catalog generation with owned filesystem resources', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mcp-catalog-'))
    await Promise.all(artifacts.map(path => mkdir(join(root, path, '..'), { recursive: true })))
    await writeFile(
      join(root, markdown),
      '# Tiny catalog\n\n<!-- BEGIN GENERATED -->\n\nold\n\n<!-- END GENERATED -->\n',
    )
  })
  afterEach(() => rm(root, { recursive: true, force: true }))

  it('writes canonical artifacts then verifies them without rewriting and closes its resource', async () => {
    const handle = await open(join(root, 'owned-resource'), 'w')
    await runCatalogGeneration([], {
      root,
      tools,
      ready: Promise.resolve(),
      closeResources: [() => handle.close()],
    })
    expect(handle.fd).toBe(-1)
    await Promise.all(artifacts.map(path => utimes(join(root, path), new Date(0), new Date(0))))
    const times = await Promise.all(
      artifacts.map(async path => (await stat(join(root, path), { bigint: true })).mtimeNs),
    )
    const before = await Promise.all(artifacts.map(path => readFile(join(root, path), 'utf8')))
    await runCatalogGeneration(['--', '--check'], {
      root,
      tools,
      ready: Promise.resolve(),
      closeResources: [],
    })
    expect(await Promise.all(artifacts.map(path => readFile(join(root, path), 'utf8')))).toEqual(
      before,
    )
    expect(
      await Promise.all(
        artifacts.map(async path => (await stat(join(root, path), { bigint: true })).mtimeNs),
      ),
    ).toEqual(times)
    expect(JSON.parse(before[0]!).servers[0].tools[0].tool.name).toBe('tiny_read')
  })

  it('rejects stale artifacts without rewriting any file', async () => {
    await runCatalogGeneration([], { root, tools, ready: Promise.resolve(), closeResources: [] })
    await writeFile(join(root, artifacts[0]!), '{}\n')
    await Promise.all(artifacts.map(path => utimes(join(root, path), new Date(0), new Date(0))))
    const times = await Promise.all(
      artifacts.map(async path => (await stat(join(root, path), { bigint: true })).mtimeNs),
    )
    const before = await Promise.all(artifacts.map(path => readFile(join(root, path), 'utf8')))
    await expect(
      runCatalogGeneration(['--check'], {
        root,
        tools,
        ready: Promise.resolve(),
        closeResources: [],
      }),
    ).rejects.toThrow('Stale MCP catalog artifacts')
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
        runCatalogGeneration(args, {
          root,
          tools,
          ready: Promise.resolve(),
          closeResources: [() => handle.close()],
        }),
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
        tools,
        ready: Promise.resolve(),
        closeResources: [() => unlink(join(root, 'missing-resource'))],
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(
      JSON.parse(await readFile(join(root, artifacts[0]!), 'utf8')).servers[0].tools[0].tool.name,
    ).toBe('tiny_read')
  })

  it('preserves generation and cleanup errors while still closing every resource', async () => {
    const handle = await open(join(root, 'owned-resource'), 'w')
    const result = runCatalogGeneration(['--unknown'], {
      root,
      tools,
      ready: Promise.resolve(),
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

  it('waits for startup failure before cleanup and retains both errors', async () => {
    const handle = await open(join(root, 'owned-resource'), 'w')
    const startupError = new Error('startup failed')
    const result = runCatalogGeneration(['--unknown'], {
      root,
      tools,
      ready: Promise.reject(startupError),
      closeResources: [() => handle.close(), () => unlink(join(root, 'missing-resource'))],
    })
    await expect(result).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [startupError, expect.objectContaining({ code: 'ENOENT' })],
    })
    expect(handle.fd).toBe(-1)
    await expect(readFile(join(root, artifacts[0]!), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
