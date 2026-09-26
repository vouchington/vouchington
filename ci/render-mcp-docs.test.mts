import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { catalogMarkdown, main, renderMcpDocs } from './render-mcp-docs.mts'

const SAMPLE_CATALOG = {
  servers: [
    {
      name: 'voucha-user-mcp',
      path: '/api/v1/mcp',
      surface: 'mcp',
      tools: [
        {
          tool: {
            name: 'get_topic',
            description: 'Fetch one topic.',
            inputSchema: { type: 'object', properties: { note: { const: '```' } } },
            annotations: { readOnlyHint: true },
            _meta: { 'voucha/requiredScopes': ['topics:read'] },
          },
          plan: 'free',
          roles: null,
          api: [{ method: 'GET', path: '/api/v1/topics/:id' }],
        },
      ],
    },
    {
      name: 'voucha-admin-mcp',
      path: '/api/v1/admin/mcp',
      surface: 'admin_mcp',
      tools: [
        {
          tool: { name: 'staff_lookup', inputSchema: { type: 'object', properties: {} } },
          roles: ['administrator', 'moderator'],
          api: null,
        },
      ],
    },
  ],
}

async function withTempDirectory(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'render-mcp-docs-'))
  try {
    await run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('catalogMarkdown', () => {
  it('describes each server and every tool gate, with fences longer than any backtick run', () => {
    expect(catalogMarkdown(SAMPLE_CATALOG).split('\n\n')).toEqual([
      '# Voucha MCP Servers',
      'Every tool each Voucha Model Context Protocol server can list, generated from the tool registry. A caller sees the subset its plan, roles and granted scopes allow. The machine-readable catalog is [mcp.json](mcp.json).',
      '## `voucha-user-mcp`',
      'Endpoint: `POST /api/v1/mcp` · Surface: `mcp` · Tools: 1',
      '### `get_topic`',
      'Fetch one topic.',
      [
        '- **Minimum plan:** free',
        '- **Roles:** any authenticated user',
        '- **Required scopes:** `topics:read`',
        '- **Annotations:** `readOnlyHint: true`',
        '- **REST equivalent:** `GET /api/v1/topics/:id`',
      ].join('\n'),
      'Input schema:',
      [
        '````json',
        JSON.stringify(SAMPLE_CATALOG.servers[0]?.tools[0]?.tool.inputSchema, null, 2),
        '````',
      ].join('\n'),
      '## `voucha-admin-mcp`',
      'Endpoint: `POST /api/v1/admin/mcp` · Surface: `admin_mcp` · Tools: 1',
      '### `staff_lookup`',
      [
        '- **Roles:** `administrator`, `moderator`',
        '- **Required scopes:** none',
        '- **Annotations:** none',
        '- **REST equivalent:** none',
      ].join('\n'),
      'Input schema:',
      '```json\n{\n  "type": "object",\n  "properties": {}\n}\n```',
    ])
  })
})

describe('renderMcpDocs', () => {
  it('writes the rendered page and a byte-identical copy of the catalog', async () => {
    await withTempDirectory(async root => {
      const catalogPath = join(root, 'mcp.json')
      const outputDir = join(root, 'out/mcp')
      const raw = `${JSON.stringify(SAMPLE_CATALOG, null, 2)}\n`
      writeFileSync(catalogPath, raw)

      await renderMcpDocs({ outputDir, catalogPath })

      const html = readFileSync(join(outputDir, 'index.html'), 'utf8')
      expect(html).toContain('<title>Voucha MCP Servers</title>')
      expect(html).toContain('<h3><code>get_topic</code></h3>')
      expect(html).toContain('href="mcp.json"')
      expect(readFileSync(join(outputDir, 'mcp.json'), 'utf8')).toBe(raw)
    })
  })

  it.each([
    ['is missing', undefined, 'Cannot read MCP catalog at'],
    ['is not JSON', '{', 'Cannot parse MCP catalog at'],
    ['has no servers', '{}', 'has no servers array'],
  ])('rejects a catalog that %s', async (_case, contents, message) => {
    await withTempDirectory(async root => {
      const catalogPath = join(root, 'mcp.json')
      if (contents !== undefined) writeFileSync(catalogPath, contents)

      await expect(renderMcpDocs({ outputDir: join(root, 'out'), catalogPath })).rejects.toThrow(
        message,
      )
    })
  })
})

describe('main', () => {
  it('returns exit code 2 and prints usage when no output directory is given', async () => {
    const error = vi.spyOn(console, 'error').mockReturnValue(undefined)
    await expect(main([])).resolves.toBe(2)
    expect(error).toHaveBeenCalledWith('Usage: render-mcp-docs.mts <output-dir>')
    error.mockRestore()
  })

  it('returns exit code 0 after rendering the committed catalog', async () => {
    await withTempDirectory(async root => {
      await expect(main([join(root, 'mcp')])).resolves.toBe(0)
      expect(readFileSync(join(root, 'mcp/mcp.json'), 'utf8')).toBe(
        readFileSync('api-fixtures/v1/mcp.json', 'utf8'),
      )
    })
  })

  it('returns exit code 1 and prints the failure when rendering fails', async () => {
    await withTempDirectory(async root => {
      const blocker = join(root, 'blocker')
      writeFileSync(blocker, '')
      const error = vi.spyOn(console, 'error').mockReturnValue(undefined)

      await expect(main([join(blocker, 'mcp')])).resolves.toBe(1)
      expect(error).toHaveBeenCalledWith(expect.stringContaining('blocker'))
      error.mockRestore()
    })
  })
})

describe('render-mcp-docs CLI', () => {
  it('renders the committed catalog end-to-end', async () => {
    await withTempDirectory(async root => {
      const outputDir = join(root, 'mcp')
      const result = spawnSync(
        process.execPath,
        [join(process.cwd(), 'ci/render-mcp-docs.mts'), outputDir],
        { encoding: 'utf8' },
      )

      expect(result).toMatchObject({ status: 0, stderr: '' })
      expect(readFileSync(join(outputDir, 'mcp.json'), 'utf8')).toBe(
        readFileSync('api-fixtures/v1/mcp.json', 'utf8'),
      )
      expect(readFileSync(join(outputDir, 'index.html'), 'utf8')).toContain(
        '<h2><code>voucha-admin-mcp</code></h2>',
      )
    })
  })
})
