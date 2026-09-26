import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

describe('gitleaks fixture scanner', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })),
    )
  })

  it('detects secrets in fixtures and retains scoped fake-value exceptions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'voucha-gitleaks-fixtures-'))
    temporaryDirectories.push(directory)
    const sourceDirectory = join(directory, 'source')
    const reportPath = join(directory, 'report.json')
    const syntheticToken = `ghp_${randomBytes(18).toString('hex')}`
    const tokenLine = `API_TOKEN="${syntheticToken}"\n`

    for (const relativeDirectory of [
      'fixtures',
      'ordinary',
      'node_modules/fixtures',
      '.local/fixtures',
      'backend/test-helpers/entities',
    ]) {
      await mkdir(join(sourceDirectory, relativeDirectory), { recursive: true })
    }
    await writeFile(join(sourceDirectory, 'fixtures/synthetic-secret.txt'), tokenLine)
    await writeFile(join(sourceDirectory, 'fixtures/benign.txt'), 'An ordinary fixture value.\n')
    await writeFile(join(sourceDirectory, 'ordinary/synthetic-secret.txt'), tokenLine)
    await writeFile(join(sourceDirectory, 'node_modules/fixtures/generated.txt'), tokenLine)
    await writeFile(join(sourceDirectory, '.local/fixtures/generated.txt'), tokenLine)
    await writeFile(
      join(sourceDirectory, 'backend/test-helpers/entities/totp.mts'),
      "export const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'\n",
    )

    const scan = spawnSync(
      'gitleaks',
      [
        'dir',
        '--config',
        join(process.cwd(), '.gitleaks.toml'),
        '--report-format=json',
        `--report-path=${reportPath}`,
        '--redact=100',
        '--no-banner',
        '.',
      ],
      { cwd: sourceDirectory, encoding: 'utf8' },
    )
    const diagnostic = [scan.stdout ?? '', scan.stderr ?? '']
      .join('\n')
      .replaceAll(syntheticToken, '[redacted test token]')

    if (scan.error) {
      throw new Error(`Could not start Gitleaks: ${scan.error.message}\n${diagnostic}`)
    }
    if (scan.status !== 1) {
      throw new Error(
        `Expected Gitleaks to report findings with exit 1; received ${scan.status}.\n${diagnostic}`,
      )
    }

    let report: string
    try {
      report = await readFile(reportPath, 'utf8')
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Gitleaks exited ${scan.status} without writing its JSON report (${detail}).\n${diagnostic}`,
        { cause: error },
      )
    }

    const findings = JSON.parse(report) as Array<{ File?: string }>
    expect([...new Set(findings.map(finding => finding.File))].sort()).toEqual([
      'fixtures/synthetic-secret.txt',
      'ordinary/synthetic-secret.txt',
    ])
    const containsSyntheticToken = (output: string | null | undefined) =>
      output?.includes(syntheticToken) ?? false
    expect(containsSyntheticToken(report)).toBe(false)
    expect(containsSyntheticToken(scan.stdout)).toBe(false)
    expect(containsSyntheticToken(scan.stderr)).toBe(false)
  })
})
