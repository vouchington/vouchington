import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const publicComment = `/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review.
 * Evidence: \`docs/overview/architecture/queues/README.md\`.
 */`
const indexComment = `/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: \`docs/overview/architecture/queues/README.md\`.
 */`
const internalComment =
  '/** @internal Handlers over the processors; tests pass substitute processors to observe the routing. */'
const tagged = '/** @public */\nexport const value = 1\n'
const routedPaths = [
  'backend/services/producer.mts',
  'backend/services/producer.test.mts',
  'backend/test-helpers/entities/fixture.mts',
  'test-helpers/fixture.mts',
  'backend/agents/producer.mts',
  'web/lib/producer.ts',
  'web/test-helpers/fixture.ts',
]

describe('Knip skip-tag configuration routing', () => {
  it('inherits the tag guard across source roots and limits sitemap exceptions to existing comment bodies', () => {
    const root = mkdtempSync(join(tmpdir(), 'voucha-knip-tag-routing-'))
    try {
      for (const config of [
        '.oxlintrc.json',
        '.oxlintrc.react.json',
        'backend/agents/.oxlintrc.json',
        'backend/test-helpers/entities/.oxlintrc.json',
        'web/.oxlintrc.json',
      ]) {
        const target = join(root, config)
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(resolve(config), target)
      }
      symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir')
      const sources = new Map(routedPaths.map(path => [path, tagged]))
      sources.set(
        'backend/workers/sitemaps/processors.mts',
        `${publicComment}\nexport const first = 1\n${indexComment}\nexport const second = 2\n${publicComment}\nexport const third = 3\n${tagged}\n// kept for compat\n// backward-compatible\n// for old callers\n`,
      )
      sources.set(
        'backend/workers/sitemaps/workers.mts',
        `${internalComment}\nexport const handlers = 1\n${internalComment.replace('Handlers', 'New handlers')}\nexport const changed = 2\n`,
      )
      sources.set(
        'backend/workers/sitemaps/unapproved.mts',
        `${publicComment}\nexport const extra = 1\n`,
      )
      for (const [path, source] of sources) {
        const target = join(root, path)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, source)
      }
      const result = spawnSync(
        resolve('node_modules/.bin/oxlint'),
        ['--format', 'json', ...sources.keys()],
        {
          cwd: root,
          encoding: 'utf8',
        },
      )
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      const { diagnostics } = JSON.parse(result.stdout) as {
        diagnostics: Array<{ code: string; filename: string }>
      }
      expect(
        diagnostics
          .filter(({ code }) => code === 'no-mistakes(no-comment-phrases)')
          .map(({ filename }) => filename.replace(`${root}/`, ''))
          .toSorted(),
      ).toEqual(
        [
          ...routedPaths,
          'backend/workers/sitemaps/processors.mts',
          'backend/workers/sitemaps/processors.mts',
          'backend/workers/sitemaps/processors.mts',
          'backend/workers/sitemaps/processors.mts',
          'backend/workers/sitemaps/workers.mts',
          'backend/workers/sitemaps/unapproved.mts',
        ].toSorted(),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
