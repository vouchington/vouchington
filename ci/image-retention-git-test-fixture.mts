import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { onTestFinished } from 'vitest'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

export async function mainRepository(commitCount: number) {
  const directory = await mkdtemp(join(tmpdir(), 'image-retention-git-'))
  onTestFinished(() => rm(directory, { force: true, recursive: true }))
  git(directory, 'init', '--quiet', '--initial-branch=main')
  git(directory, 'config', 'user.email', 'retention@example.invalid')
  git(directory, 'config', 'user.name', 'Retention Test')
  const shas: string[] = []
  for (let index = 0; index < commitCount; index++) {
    await writeFile(join(directory, 'fixture'), String(index))
    git(directory, 'add', 'fixture')
    git(directory, 'commit', '--quiet', '-m', `synthetic-${index}`)
    shas.push(git(directory, 'rev-parse', 'HEAD'))
  }
  const tip = shas.at(-1)!
  git(directory, 'update-ref', 'refs/remotes/origin/main', tip)
  await mkdir(join(directory, '.github'), { recursive: true })
  await writeFile(
    join(directory, '.github/worker-io-automation.env'),
    'WORKER_IO_AUTOMATION_ENABLED=false\n',
  )
  return { directory, shas, tip }
}
