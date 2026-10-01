import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
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
    const existingFakeSecret = ['existing-test-secret-', 'at-least-32-chars'].join('')
    // Random suffixes occasionally fall under the generic rule's filters, so derive a stable one.
    const alteredFakeSecret = `existing-test-secret-${createHash('sha256').update('scanner altered fake secret').digest('hex').slice(0, 36)}`
    const siblingFakeAssignment = ['CF_WORKER_', 'SECRET=', existingFakeSecret, '\n'].join('')
    const splitWorkerSecretLine = (secret: string) =>
      `      ['export CF_WORKER_', 'SECRET', '=${secret}\\n  '].join(''),`
    const tokenLine = `API_TOKEN="${syntheticToken}"\n`

    for (const relativeDirectory of [
      'fixtures',
      'ordinary',
      'node_modules/fixtures',
      '.local/fixtures',
      'backend/test-helpers/entities',
      'dev/initialize-tests/__tests__',
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
    await writeFile(
      join(sourceDirectory, 'dev/initialize-tests/__tests__/initialize-secrets-and-s3.test.mts'),
      [splitWorkerSecretLine(existingFakeSecret), splitWorkerSecretLine(alteredFakeSecret)].join(
        '\n',
      ),
    )
    await writeFile(
      join(
        sourceDirectory,
        'dev/initialize-tests/__tests__/initialize-secrets-and-s3-copy.test.mts',
      ),
      siblingFakeAssignment,
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
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Gitleaks exited ${scan.status} without writing its JSON report (${detail}).\n${diagnostic}`,
        { cause: err },
      )
    }

    const findings = JSON.parse(report) as Array<{
      File?: string
      RuleID?: string
      StartLine?: number
    }>
    expect(
      findings
        .map(({ File, StartLine }) => [File, StartLine])
        .toSorted(
          ([leftFile, leftLine], [rightFile, rightLine]) =>
            String(leftFile).localeCompare(String(rightFile)) ||
            Number(leftLine) - Number(rightLine),
        ),
    ).toEqual([
      ['dev/initialize-tests/__tests__/initialize-secrets-and-s3-copy.test.mts', 1],
      ['dev/initialize-tests/__tests__/initialize-secrets-and-s3.test.mts', 2],
      ['fixtures/synthetic-secret.txt', 1],
      ['ordinary/synthetic-secret.txt', 1],
    ])
    expect(
      findings.some(
        ({ File, RuleID, StartLine }) =>
          File === 'dev/initialize-tests/__tests__/initialize-secrets-and-s3-copy.test.mts' &&
          RuleID === 'generic-api-key' &&
          StartLine === 1,
      ),
    ).toBe(true)
    expect(
      findings.some(
        ({ File, RuleID, StartLine }) =>
          File === 'dev/initialize-tests/__tests__/initialize-secrets-and-s3.test.mts' &&
          RuleID === 'generic-api-key' &&
          StartLine === 2,
      ),
    ).toBe(true)
    const containsSyntheticToken = (output: string | null | undefined) =>
      output?.includes(syntheticToken) ?? false
    expect(containsSyntheticToken(report)).toBe(false)
    expect(containsSyntheticToken(scan.stdout)).toBe(false)
    expect(containsSyntheticToken(scan.stderr)).toBe(false)
  })
})
