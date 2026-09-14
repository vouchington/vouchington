import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'

export interface RepoFixture {
  ctx: SharedContext
  dir: string
}

export async function makeRepoFixture(files: Record<string, string>): Promise<RepoFixture> {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-config-inventory-'))
  const trackedFiles = Object.keys(files)
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(dir, file, '..'), { recursive: true })
    await writeFile(join(dir, file), content)
  }
  return {
    ctx: {
      repoRoot: dir,
      isInsideGitRepo: true,
      trackedFiles,
      trackedFileSet: new Set(trackedFiles),
    },
    dir,
  }
}
