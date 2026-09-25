import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { type RunProcessResult, runProcess } from '../test-helpers/run-process.mts'

const testDirs: string[] = []

const nativeAddonConsumers: (readonly [string, string, string?])[] = [
  ['lingua-rs', 'backend/services/language-detection/package.json'],
  ['@jongleberry/vurst-ai', 'backend/workers/ai-agents/package.json'],
  [
    '@jongleberry/vurst-html',
    'backend/services/crawler-html/package.json',
    '@vouchington/crawler-html',
  ],
  ['@jongleberry/vurst-markdown', 'backend/modules/markdown-extraction/package.json'],
]

const nativeAddonReadinessPath = fileURLToPath(
  new URL('../native-addon-readiness.mts', import.meta.url),
)

async function makeNativeAddonFixture(addons: ReadonlyMap<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'voucha-native-addon-readiness-'))
  testDirs.push(root)

  await Promise.all(
    nativeAddonConsumers.map(async ([, consumerPackagePath]) => {
      const packagePath = join(root, consumerPackagePath)
      await mkdir(join(packagePath, '..'), { recursive: true })
      await writeFile(packagePath, '{"private":true}\n')
    }),
  )
  await Promise.all(
    nativeAddonConsumers.flatMap(([, , throughPackage]) =>
      throughPackage
        ? [
            (async () => {
              const packageRoot = join(root, 'node_modules', throughPackage)
              await mkdir(packageRoot, { recursive: true })
              await writeFile(
                join(packageRoot, 'package.json'),
                `{"name":"${throughPackage}","main":"index.cjs"}\n`,
              )
              await writeFile(join(packageRoot, 'index.cjs'), 'module.exports = {}\n')
            })(),
          ]
        : [],
    ),
  )
  await Promise.all(
    [...addons].map(async ([packageName, source]) => {
      const packageRoot = join(root, 'node_modules', packageName)
      await mkdir(packageRoot, { recursive: true })
      await writeFile(
        join(packageRoot, 'package.json'),
        `{"name":"${packageName}","main":"index.cjs"}\n`,
      )
      await writeFile(join(packageRoot, 'index.cjs'), source)
    }),
  )

  return root
}

async function runNativeAddonReadiness(root: string): Promise<RunProcessResult> {
  const env = { ...process.env }
  delete env.NODE_PATH

  const result = await runProcess(process.execPath, [nativeAddonReadinessPath], { cwd: root, env })
  return { ...result, stderr: result.stderr.trim(), stdout: result.stdout.trim() }
}

describe('native addon readiness', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('accepts every installed native addon', async () => {
    const root = await makeNativeAddonFixture(
      new Map(nativeAddonConsumers.map(([packageName]) => [packageName, 'module.exports = {}\n'])),
    )

    const result = await runNativeAddonReadiness(root)

    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('✓ Native addons are ready')
  })

  it('reports an addon that cannot be resolved from its consumer workspace', async () => {
    const root = await makeNativeAddonFixture(
      new Map(
        nativeAddonConsumers
          .slice(1)
          .map(([packageName]) => [packageName, 'module.exports = {}\n']),
      ),
    )

    const result = await runNativeAddonReadiness(root)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('lingua-rs:')
    expect(result.stderr).toContain('Cannot find module')
    expect(result.stderr).toContain('pnpm install --frozen-lockfile --force')
    expect(result.stderr).toContain('Rerun the same ./dev/initialize command after reinstalling')
  })

  it('reports an addon whose entry point throws during import', async () => {
    const root = await makeNativeAddonFixture(
      new Map(
        nativeAddonConsumers.map(([packageName]) => [
          packageName,
          packageName === '@jongleberry/vurst-html'
            ? "throw new Error('native asset unavailable')\n"
            : 'module.exports = {}\n',
        ]),
      ),
    )

    const result = await runNativeAddonReadiness(root)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('@jongleberry/vurst-html: native asset unavailable')
    expect(result.stderr).toContain('pnpm install --frozen-lockfile --force')
  })

  it('reports mixed failures in registry order and recommends one frozen reinstall', async () => {
    const root = await makeNativeAddonFixture(
      new Map([
        ['lingua-rs', "throw new Error('lingua failed')\n"],
        ['@jongleberry/vurst-ai', 'module.exports = {}\n'],
        ['@jongleberry/vurst-html', "throw new Error('html failed')\n"],
        ['@jongleberry/vurst-markdown', 'module.exports = {}\n'],
      ]),
    )

    const result = await runNativeAddonReadiness(root)

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(
      /lingua-rs: lingua failed[\s\S]*@jongleberry\/vurst-html: html failed/,
    )
    expect(result.stderr.split('\n').filter(line => line.startsWith('Repair with:'))).toEqual([
      'Repair with: pnpm install --frozen-lockfile --force',
    ])
  })
})
