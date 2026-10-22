import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDockerImageMirrors } from './docker-image-mirror.mts'

describe('finite tracked mirror policy', () => {
  it('checks only tracked workflow, composite-action and Dockerfile inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docker-mirror-policy-'))
    try {
      await mkdir(join(root, '.github/workflows'), { recursive: true })
      await mkdir(join(root, '.github/actions/build'), { recursive: true })
      await writeFile(
        join(root, '.github/workflows/test.yml'),
        'jobs:\n  build:\n    container: node\n',
      )
      await writeFile(
        join(root, '.github/actions/build/action.yaml'),
        'runs:\n  image: docker://alpine\n',
      )
      await writeFile(join(root, 'Dockerfile'), 'FROM ubuntu\n')
      await writeFile(join(root, 'unrelated.yml'), 'not: [valid')
      await writeFile(join(root, '.github/workflows/untracked.yml'), 'jobs: [invalid')
      expect(
        checkDockerImageMirrors(root, [
          '.github/workflows/test.yml',
          '.github/actions/build/action.yaml',
          'Dockerfile',
          'unrelated.yml',
        ]),
      ).toHaveLength(3)
      expect(
        checkDockerImageMirrors(root, ['unrelated.yml', '.github/workflows/deleted.yml']),
      ).toEqual([])
      await writeFile(join(root, 'Dockerfile'), 'FROM mirror.gcr.io/library/ubuntu\n')
      expect(checkDockerImageMirrors(root, ['Dockerfile'])).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  describe('tracked mirror policy failures', () => {
    it('does not silently ignore an unreadable tracked input', () => {
      expect(() => checkDockerImageMirrors('/nonexistent-mirror-fixture', ['Dockerfile'])).toThrow(
        'ENOENT',
      )
    })
  })
})
