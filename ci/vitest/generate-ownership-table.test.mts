import { describe, expect, it } from 'vitest'

import { registerGeneratedDocWriteCases } from '../test-helpers/generated-doc-writer.mts'
import { renderVitestOwnershipDoc, writeVitestOwnershipDoc } from './generate-ownership-table.mts'
import { VITEST_OWNERSHIP } from './project-ownership.mts'

const FIXTURE = [
  '# Vitest CI Mapping',
  '',
  'Some prose that must survive regeneration untouched.',
  '',
  '<!-- BEGIN GENERATED: vitest-ownership -->',
  '',
  '| Vitest project | Workflow | Job | Credential requirement |',
  '| --- | --- | --- | --- |',
  '| `stale-project` | `stale.yml` | `stale-job` | None |',
  '',
  '<!-- END GENERATED -->',
  '',
  'Trailing prose that must also survive regeneration untouched.',
  '',
].join('\n')

describe('renderVitestOwnershipDoc', () => {
  it('splices a freshly rendered table between the markers and leaves surrounding prose untouched', async () => {
    const output = await renderVitestOwnershipDoc(FIXTURE)

    expect(output).toContain('Some prose that must survive regeneration untouched.')
    expect(output).toContain('Trailing prose that must also survive regeneration untouched.')
    expect(output).not.toContain('stale-project')
    expect(output).not.toContain('stale.yml')
  })

  it('renders every project from VITEST_OWNERSHIP exactly once, as its own table row', async () => {
    const output = await renderVitestOwnershipDoc(FIXTURE)

    for (const job of VITEST_OWNERSHIP) {
      for (const { project } of job.projects) {
        // Match the row-start cell, not a bare backtick-wrapped substring — some project names
        // (e.g. "backend-modules") coincide with a Job column label and would otherwise
        // double-count. oxfmt pads cells to align columns, so allow variable whitespace.
        const escaped = RegExp.escape(project)
        const rowStart = new RegExp(`^\\|\\s*\`${escaped}\`\\s*\\|`, 'gm')
        expect([...output.matchAll(rowStart)]).toHaveLength(1)
      }
    }
  })

  it('renders env-var-shaped credentials as code and descriptive credentials as prose', async () => {
    const output = await renderVitestOwnershipDoc(FIXTURE)

    expect(output).toContain('`OPENAI_API_KEY`')
    expect(output).toContain('`STRIPE_SECRET_KEY`')
    expect(output).toContain('AWS tests role + Bedrock')
    expect(output).not.toContain('`AWS tests role + Bedrock`')
  })

  it('is idempotent: re-rendering its own output produces byte-identical content', async () => {
    const once = await renderVitestOwnershipDoc(FIXTURE)
    const twice = await renderVitestOwnershipDoc(once)

    expect(twice).toBe(once)
  })

  it('throws when the BEGIN/END markers are missing', async () => {
    await expect(renderVitestOwnershipDoc('# No markers here\n')).rejects.toThrow(
      /BEGIN GENERATED: vitest-ownership/,
    )
  })
})

registerGeneratedDocWriteCases({
  check: docPath => writeVitestOwnershipDoc({ check: true, docPath }),
  commandPattern: /generate-ownership-table\.mts/,
  filename: 'VITEST.md',
  fixture: FIXTURE,
  staleToken: 'stale-project',
  tempPrefix: 'vitest-ownership-doc-',
  title: 'writeVitestOwnershipDoc',
  write: docPath => writeVitestOwnershipDoc({ docPath }),
})
