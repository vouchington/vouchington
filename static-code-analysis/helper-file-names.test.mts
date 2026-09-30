import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'

const repository = fileURLToPath(new URL('../', import.meta.url))
const cli = join(repository, 'node_modules/no-mistakes/bin/no-mistakes.js')

describe('helper file basename policy', () => {
  it('rejects tracked forbidden basenames while allowing helper directories and ignoring untracked files', async () => {
    const config = parse(await readFile(join(repository, '.no-mistakes.yml'), 'utf8'))
    const guard = config.rules
      .find((rule: { name: string }) => rule.name === 'banned repository paths')
      .options.bannedPaths.find((entry: { glob: string }) => entry.glob === '**/*test-helpers*')
    expect(guard).toBeDefined()
    const directory = await mkdtemp(join(tmpdir(), 'helper-file-names-'))
    try {
      const rejected = [
        'foo-test-helpers.mts',
        'other/domain/foo-test-helpers.md',
        'backend/test-helpers/foo-test-helpers.mts',
      ]
      const allowed = ['test-helpers/foo.mts', 'backend/test-helpers/foo.mts', 'other/helpers.mts']
      const ignored = ['untracked/foo-test-helpers.mts', 'ignored/foo-test-helpers.mts']
      for (const path of [...rejected, ...allowed, ...ignored]) {
        const file = join(directory, path)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, '')
      }
      await writeFile(join(directory, '.gitignore'), 'ignored/\n')
      await writeFile(
        join(directory, '.no-mistakes.yml'),
        stringify({
          rules: [
            {
              name: 'helper file basenames',
              rule: 'banned-paths',
              scope: 'repository',
              options: { bannedPaths: [guard] },
            },
          ],
        }),
      )
      expect(spawnSync('git', ['init', '-q', directory]).status).toBe(0)
      expect(
        spawnSync('git', [
          '-C',
          directory,
          'add',
          ...rejected,
          ...allowed,
          '.gitignore',
          '.no-mistakes.yml',
        ]).status,
      ).toBe(0)
      const result = spawnSync(
        process.execPath,
        [cli, 'check', '--root', directory, '--format', 'json'],
        {
          encoding: 'utf8',
        },
      )
      expect(result.status).toBe(1)
      const diagnostics = JSON.parse(result.stdout).rules as { file: string; message: string }[]
      expect(diagnostics.map(item => item.file).sort()).toEqual(rejected.sort())
      expect(diagnostics.every(item => item.message === guard.message)).toBe(true)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
