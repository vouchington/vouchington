import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'

const repository = fileURLToPath(new URL('../..', import.meta.url))
const cli = join(repository, 'node_modules/no-mistakes/bin/no-mistakes.js')
const directories: string[] = []

describe('configured redirect destination rule', () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(root => rm(root, { force: true, recursive: true })))
  })

  it('checks tuple destinations against tracked App Router pages, including route groups', async () => {
    const root = await fixture(`
    const config = { async redirects() {
      const ownerPrivatePaths: Array<[string, string]> = [['saved', 'my/saved']]
      return ownerPrivatePaths.map(([src, dst]) => ({source: \`/user/:id/\${src}\`, destination: \`/\${dst}\`, permanent: false}))
    }, async rewrites() { return [{source: '/ignored', destination: '/missing'}] } }
    export default config
  `)
    await write(root, 'web/app/(my)/my/saved/page.tsx', 'export default function Page() {}')
    // An on-disk page must not satisfy the configured tracked route inventory.
    expect(check(root).status).toBe(1)
    expect(spawnSync('git', ['-C', root, 'add', 'web/app']).status).toBe(0)
    expect(check(root).status).toBe(0)
  })

  it('rejects incomplete redirect construction through the configured rule', async () => {
    const root = await fixture(`export default { async redirects() {
    const ownerPrivatePaths = generatePaths()
    return ownerPrivatePaths.map(([src, dst]) => ({source: src, destination: dst, permanent: false}))
  } }`)
    const result = check(root)
    expect(result.status).toBe(1)
    const report = JSON.parse(result.stdout) as { rules: { rule: string; file: string }[] }
    expect(
      report.rules.some(
        finding =>
          finding.rule === 'nextjs-redirect-destinations' && finding.file === 'web/next.config.ts',
      ),
    ).toBe(true)
  })
})

async function fixture(config: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tracked-redirect-routes-'))
  directories.push(root)
  const repositoryConfig = parse(await readFile(join(repository, '.no-mistakes.yml'), 'utf8')) as {
    rules: { rule?: string }[]
  }
  const rules = repositoryConfig.rules.filter(rule => rule.rule === 'nextjs-redirect-destinations')
  expect(rules).toHaveLength(1)
  await write(root, '.no-mistakes.yml', stringify({ rules }))
  await write(root, 'web/next.config.ts', config)
  expect(spawnSync('git', ['init', '-q', root]).status).toBe(0)
  expect(spawnSync('git', ['-C', root, 'add', '.']).status).toBe(0)
  return root
}

async function write(root: string, path: string, contents: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), contents)
}

function check(root: string) {
  return spawnSync(process.execPath, [cli, 'check', '--root', root, '--format', 'json'], {
    encoding: 'utf8',
  })
}
