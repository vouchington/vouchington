import { execFile, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { listenOnEphemeralPort } from '../../ts-shared/utils/ephemeral-ports.mts'
import {
  assertShellSnippetsInOrder,
  requiredNamedStep,
  type WorkflowJob,
} from './workflow-test-helpers.mts'

type Workflow = {
  jobs?: Record<string, WorkflowJob>
  on?: {
    merge_group?: unknown
    pull_request?: unknown
  }
}

const workflow = load(readFileSync('.github/workflows/gitleaks.yml', 'utf8')) as Workflow
const execFileAsync = promisify(execFile)

describe('gitleaks workflow', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })),
    )
  })

  it('passes event values through env before computing the scan range', () => {
    const step = requiredNamedStep(workflow.jobs?.['gitleaks'], 'Determine Gitleaks scan range')

    expect(step.env).toMatchObject({
      EVENT_NAME: '${{ github.event_name }}',
      HEAD_SHA: '${{ github.sha }}',
      MERGE_GROUP_BASE_SHA: '${{ github.event.merge_group.base_sha }}',
      MERGE_GROUP_HEAD_SHA: '${{ github.event.merge_group.head_sha }}',
      PR_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      PR_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
      PUSH_BEFORE_SHA: '${{ github.event.before }}',
    })
    expect(step.run).not.toContain('${{')
    assertShellSnippetsInOrder(step.run ?? '', [
      '"$EVENT_NAME" == "pull_request"',
      'git merge-base "$PR_BASE_SHA" "$PR_HEAD_SHA"',
      'LOG_OPTS="${MERGE_BASE}..${PR_HEAD_SHA}"',
      '"$EVENT_NAME" == "merge_group"',
      'LOG_OPTS="${MERGE_GROUP_BASE_SHA}..${MERGE_GROUP_HEAD_SHA}"',
      '"$EVENT_NAME" == "workflow_dispatch"',
      'LOG_OPTS="--all"',
      `"$PUSH_BEFORE_SHA" == "${'0'.repeat(40)}"`,
      'LOG_OPTS="--all"',
      'LOG_OPTS="${PUSH_BEFORE_SHA}..${HEAD_SHA}"',
    ])
  })

  it('installs gitleaks into a per-job bin directory', () => {
    const step = requiredNamedStep(workflow.jobs?.['gitleaks'], 'Install gitleaks')

    expect(step.run).toContain(': "${RUNNER_TEMP:?RUNNER_TEMP must be set by GitHub Actions}"')
    expect(step.run).toContain('ci/install-github-release.sh')
    expect(step.run).toContain('--repo gitleaks/gitleaks')
    expect(step.run).toContain('--bin-dir "$RUNNER_TEMP/bin"')
    expect(step.run).toContain("--checksums-asset 'gitleaks_{version}_checksums.txt'")
    expect(step.run).toContain('--version-flag version')
    expect(step.run).not.toContain('${RUNNER_TEMP:-')
    expect(step.run).not.toContain('GITLEAKS_BIN_DIR="$HOME/.local')
    expect(step.run).not.toContain('mkdir -p "$HOME/.local')
    expect(step.run).not.toContain('/tmp')
  })

  it('runs the version-skip check against the resolved bin dir, not a bare command', () => {
    const step = requiredNamedStep(workflow.jobs?.['gitleaks'], 'Install gitleaks')

    expect(step.run).toContain('--bin-dir "$RUNNER_TEMP/bin"')
    expect(step.run).toContain('--version-flag version')
    expect(step.run).not.toMatch(/(?<!")\bif gitleaks version\b/)
  })

  it('installs through GitHub Releases and continues through verification and the PR scan', async () => {
    expect(workflow).toHaveProperty('on.pull_request')
    expect(workflow).toHaveProperty('on.merge_group')
    const job = workflow.jobs?.['gitleaks']
    const install = requiredNamedStep(job, 'Install gitleaks')
    const scan = requiredNamedStep(job, 'Scan git history')
    const gitleaksVersion = install.env?.['GITLEAKS_VERSION']
    if (!gitleaksVersion) throw new Error('Install gitleaks must declare GITLEAKS_VERSION')
    expect(job).not.toHaveProperty('if')
    expect(scan).not.toHaveProperty('if')
    expect(install.run).toContain('ci/install-github-release.sh')
    expect(install.run).toContain('--repo gitleaks/gitleaks')
    expect(install.run).toContain("--checksums-asset 'gitleaks_{version}_checksums.txt'")

    const directory = await mkdtemp(join(tmpdir(), 'voucha-gitleaks-retry-'))
    temporaryDirectories.push(directory)
    const fixtureDirectory = join(directory, 'fixture')
    const archive = join(directory, 'gitleaks.tar.gz')
    const fakeCurlDirectory = join(directory, 'bin')
    const invocationLog = join(directory, 'gitleaks-invocations')
    const githubPath = join(directory, 'github-path')
    await mkdir(fixtureDirectory, { recursive: true })
    await mkdir(fakeCurlDirectory, { recursive: true })

    const fixtureBinary = join(fixtureDirectory, 'gitleaks')
    await writeFile(
      fixtureBinary,
      '#!/usr/bin/env bash\nprintf \'%s\\n\' "$@" >> "$GITLEAKS_INVOCATIONS"\n',
    )
    await chmod(fixtureBinary, 0o755)
    const tar = spawnSync('tar', ['-czf', archive, '-C', fixtureDirectory, 'gitleaks'], {
      encoding: 'utf8',
    })
    expect(tar.status).toBe(0)
    const archiveBytes = await readFile(archive)
    const digest = createHash('sha256').update(archiveBytes).digest('hex')
    const checksumBody = ['darwin_arm64', 'darwin_x64', 'linux_arm64', 'linux_x64']
      .map(platform => `${digest}  gitleaks_${gitleaksVersion}_${platform}.tar.gz`)
      .join('\n')

    let checksumRequests = 0
    const server = createServer((request, response) => {
      if (
        request.url?.endsWith('_checksums.txt') ||
        request.url?.endsWith('/gitleaks_checksums.txt')
      ) {
        checksumRequests += 1
        response.end(checksumBody)
        return
      }
      response.end(archiveBytes)
    })
    const port = await listenOnEphemeralPort(server, '127.0.0.1')

    try {
      const fakeCurl = join(fakeCurlDirectory, 'curl')
      // Curl uses the last repeated option, so these trailing test-only values override the
      // production 15-second attempt timeout and retry delay without changing the real script.
      await writeFile(
        fakeCurl,
        `#!/usr/bin/env bash
rewritten=()
for argument in "$@"; do
  case "$argument" in
    https://github.com/gitleaks/gitleaks/releases/download/*_checksums.txt)
      rewritten+=("$GITLEAKS_FIXTURE_URL/gitleaks_checksums.txt")
      ;;
    https://github.com/gitleaks/gitleaks/releases/download/*.tar.gz)
      rewritten+=("$GITLEAKS_FIXTURE_URL/gitleaks.tar.gz")
      ;;
    *) rewritten+=("$argument") ;;
  esac
done
exec "$REAL_CURL" "\${rewritten[@]}"
`,
      )
      await chmod(fakeCurl, 0o755)
      const realCurl = spawnSync('/bin/bash', ['-c', 'command -v curl'], {
        encoding: 'utf8',
      }).stdout.trim()
      expect(realCurl).not.toBe('')
      const environment = {
        ...process.env,
        GITHUB_PATH: githubPath,
        GITHUB_WORKSPACE: process.cwd(),
        GITLEAKS_FIXTURE_URL: `http://127.0.0.1:${port}`,
        GITLEAKS_INVOCATIONS: invocationLog,
        GITLEAKS_VERSION: gitleaksVersion,
        PATH: `${fakeCurlDirectory}:${process.env.PATH ?? ''}`,
        REAL_CURL: realCurl,
        RUNNER_TEMP: directory,
      }
      await execFileAsync('/bin/bash', ['-e', '-o', 'pipefail', '-c', install.run ?? 'exit 99'], {
        encoding: 'utf8',
        env: environment,
      })
      expect(checksumRequests).toBe(1)

      const installedPath = (await readFile(githubPath, 'utf8')).trim()
      const scanScript = (scan.run ?? 'exit 99').replace(
        '${{ steps.gitleaks_scan.outputs.log-opts }}',
        'base..head',
      )
      await execFileAsync('/bin/bash', ['-e', '-o', 'pipefail', '-c', scanScript], {
        encoding: 'utf8',
        env: { ...environment, PATH: `${installedPath}:${environment.PATH}` },
      })
      await expect(readFile(invocationLog, 'utf8')).resolves.toBe(
        [
          'git',
          '--config',
          '.gitleaks.toml',
          '--log-opts',
          'base..head',
          '--redact=100',
          '--report-format=json',
          '--report-path=gitleaks-report.json',
          '.',
          '',
        ].join('\n'),
      )
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }, 15_000)
})
