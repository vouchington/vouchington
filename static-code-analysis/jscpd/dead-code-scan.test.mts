import { execFileSync } from 'node:child_process'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanDeadCode } from './dead-code-scan.mts'
import { copyTrackedWorkingTree } from './tracked-snapshot.mts'

const jscpd = resolve('node_modules/.bin/jscpd')

describe('released jscpd dead-code invocation', () => {
  it('reports a tracked orphan even when an untracked importer and gitignore mask it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jscpd-native-test-'))
    const repo = join(directory, 'repo')
    const snapshot = join(directory, 'snapshot')
    try {
      await mkdir(repo)
      execFileSync('git', ['init', '-q'], { cwd: repo })
      await writeFile(join(repo, 'main.mts'), 'export const live = 1\n')
      await writeFile(join(repo, 'orphan.mts'), 'export const orphan = 2\n')
      await writeFile(
        join(repo, '.jscpd.json'),
        JSON.stringify({
          format: ['typescript'],
          deadCode: {
            categories: ['unused-file'],
            minConfidence: 70,
            entry: ['main.mts'],
          },
        }),
      )
      execFileSync('git', ['add', 'main.mts', 'orphan.mts', '.jscpd.json'], { cwd: repo })
      await writeFile(join(repo, 'importer.mts'), "import './orphan.mts'\n")
      await writeFile(join(repo, '.gitignore'), 'orphan.mts\n')
      await copyTrackedWorkingTree(repo, snapshot)
      const rows = await scanDeadCode(snapshot, join(directory, 'report'), jscpd)
      expect(rows).toContainEqual({
        category: 'unused-file',
        path: 'orphan.mts',
        parent: '',
        name: '',
        symbolKind: '',
        count: 1,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('fails when the analyzer exits unsuccessfully or omits its JSON report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jscpd-process-test-'))
    try {
      const failing = join(directory, 'fail.sh')
      const silent = join(directory, 'silent.sh')
      await writeFile(failing, '#!/bin/sh\nexit 7\n')
      await writeFile(silent, '#!/bin/sh\nexit 0\n')
      await chmod(failing, 0o755)
      await chmod(silent, 0o755)
      await expect(scanDeadCode(directory, join(directory, 'failed'), failing)).rejects.toThrow(
        'Command failed',
      )
      await expect(scanDeadCode(directory, join(directory, 'silent'), silent)).rejects.toThrow(
        'ENOENT',
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
