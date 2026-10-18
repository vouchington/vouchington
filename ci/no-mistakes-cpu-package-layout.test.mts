import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const root = fileURLToPath(new URL('..', import.meta.url))
const processorOnlyDomains = [
  'bedrock-embeddings',
  'bedrock-embeddings-batch',
  'content-analysis',
  'crawl-dispatch',
  'crawl-referral-links',
  'crawler',
  'unfurl-referral-links',
] as const

type PackageSpec = { root: string; requiredFiles: string[]; requireAnyOf?: string[][] }
type Rule = {
  name: string
  rule: string
  scope: string
  exclude?: string[]
  options: { packages: PackageSpec[] }
}
type Config = { rules: Rule[] }

function packageLayoutRule(): Rule {
  const config = parseYaml(readFileSync(`${root}/.no-mistakes.yml`, 'utf8')) as Config
  const rule = config.rules.find(entry => entry.name === 'backend package required files')
  if (!rule) throw new Error('Missing backend package layout rule')
  return rule
}

function runPackageScanner(rule: Rule): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'voucha-cpu-layout-'))
  try {
    for (const path of [
      'backend/queues/crawler',
      'backend/queues/crawler-missing',
      'backend/queues/image-uploads',
      'backend/workers/crawler',
      'backend/workers/crawler-missing',
      'backend/workers/image-uploads',
    ]) {
      mkdirSync(join(fixtureRoot, path), { recursive: true })
      writeFileSync(join(fixtureRoot, path, 'package.json'), '{}')
    }
    writeFileSync(
      join(fixtureRoot, '.no-mistakes.yml'),
      JSON.stringify({
        rules: [
          {
            rule: rule.rule,
            scope: rule.scope,
            exclude: rule.exclude,
            options: {
              packages: rule.options.packages.filter(spec =>
                ['backend/queues', 'backend/workers'].includes(spec.root),
              ),
            },
          },
        ],
      }),
    )
    const result = spawnSync(
      join(root, 'node_modules/.bin/no-mistakes'),
      [
        '--timeout',
        '8',
        '--lock-timeout',
        '20',
        'check',
        '--root',
        fixtureRoot,
        '--format',
        'human',
      ],
      { cwd: fixtureRoot, encoding: 'utf8' },
    )
    if (result.error) throw result.error
    expect(`${result.stdout}${result.stderr}`).toContain('backend/queues/image-uploads')
    expect(result.status).toBe(1)
    return `${result.stdout}${result.stderr}`
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

describe('shared CPU package layout guard', () => {
  it('keeps exact shared-domain exclusions and processor/enqueue source ownership', () => {
    const rule = packageLayoutRule()
    const expected = processorOnlyDomains.flatMap(domain => [
      `backend/queues/${domain}/**`,
      `backend/workers/${domain}/**`,
    ])
    expect(rule.exclude?.toSorted()).toEqual(expected.toSorted())

    for (const domain of processorOnlyDomains) {
      expect(existsSync(`${root}/backend/queues/${domain}/package.json`)).toBe(true)
      expect(
        existsSync(`${root}/backend/queues/${domain}/enqueues.mts`) ||
          existsSync(`${root}/backend/queues/${domain}/enqueues`),
      ).toBe(true)
      expect(existsSync(`${root}/backend/workers/${domain}/package.json`)).toBe(true)
      expect(
        existsSync(`${root}/backend/workers/${domain}/processors.mts`) ||
          existsSync(`${root}/backend/workers/${domain}/processors`),
      ).toBe(true)
      expect(existsSync(`${root}/backend/workers/${domain}/workers.mts`)).toBe(false)
    }
  })

  it('suppresses shared domains but still catches missing dedicated queue and worker files', () => {
    const rule = packageLayoutRule()
    const output = runPackageScanner(rule)
    expect(output).not.toContain('backend/queues/crawler: missing required file')
    expect(output).not.toContain('backend/workers/crawler: missing required file')
    expect(output).toContain('backend/queues/crawler-missing: missing required file')
    expect(output).toContain('backend/workers/crawler-missing: missing required file')
    expect(output).toContain('backend/queues/image-uploads: missing required file')
    expect(output).toContain('backend/workers/image-uploads: missing required file')
  }, 30_000)
})
