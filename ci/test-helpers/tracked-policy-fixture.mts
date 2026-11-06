import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { onTestFinished } from 'vitest'

const exec = promisify(execFile)
const ownedRoots = new Set<string>()

function fixtureFile(root: string, path: string): string {
  if (!ownedRoots.has(root)) throw new Error('Policy fixture root is not owned by this test')
  const target = resolve(root, path)
  if (!target.startsWith(`${resolve(root)}${sep}`)) {
    throw new Error('Policy fixture path escapes its owned root')
  }
  return target
}

export async function createTrackedPolicyFixture(
  sources: Readonly<Record<string, string>>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vitest-contract-policy-'))
  ownedRoots.add(root)
  onTestFinished(async () => {
    ownedRoots.delete(root)
    await rm(root, { recursive: true, force: true })
  })
  await exec('git', ['init', '--quiet', root])
  for (const [path, source] of Object.entries(sources)) {
    const target = fixtureFile(root, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, source)
  }
  await exec('git', ['-C', root, 'add', '.'])
  return root
}

export async function writeTrackedPolicyFixture(
  root: string,
  path: string,
  source: string,
): Promise<void> {
  const target = fixtureFile(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, source)
  await exec('git', ['-C', root, 'add', '--', path])
}
