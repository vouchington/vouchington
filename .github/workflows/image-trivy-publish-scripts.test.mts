import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const backend = '.github/actions/build-backend-images'
const web = '.github/actions/build-web-images'
const digest = `sha256:${'a'.repeat(64)}`
const fixtures: string[] = []

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'image-trivy-publish-'))
  fixtures.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const files = {
    log: join(root, 'commands.log'),
    summary: join(root, 'summary'),
    output: join(root, 'output'),
  }
  for (const file of [files.log, files.summary, files.output]) writeFileSync(file, '')
  return { root, bin, ...files }
}

function executable(bin: string, name: string, body: string): void {
  writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 })
}

function execute(
  args: string[],
  fixture: ReturnType<typeof createFixture>,
  env: Record<string, string>,
) {
  return spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', ...args], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      IMAGE_REPOSITORY: 'local/fixture',
      IMAGE_TAG: 'sha-1',
      TRIVY_FINDINGS_EXIT_CODE: '10',
      GITHUB_STEP_SUMMARY: fixture.summary,
      GITHUB_OUTPUT: fixture.output,
      TRIVY_LOG: fixture.log,
      ...env,
      PATH: `${fixture.bin}${delimiter}${process.env.PATH ?? ''}`,
    },
  })
}

const runFile = (directory: string, script: string) => [resolve(directory, script)]
const sourceFile = (directory: string, script: string) => [
  '-c',
  `source "${resolve(directory, script)}"`,
]

function fakeTrivy(fixture: ReturnType<typeof createFixture>, exitCode: string): void {
  executable(
    fixture.bin,
    'trivy',
    [
      'printf \'%s\\n\' "$*" >> "$TRIVY_LOG"',
      'prev=""',
      'for a in "$@"; do',
      '  if [ "$prev" = --output ]; then printf \'scan table\\n\' > "$a"; fi',
      '  prev=$a',
      'done',
      `exit ${exitCode}`,
    ].join('\n'),
  )
}

function fakeDocker(fixture: ReturnType<typeof createFixture>, failPushes = 0): void {
  executable(fixture.bin, 'sleep', 'exit 0')
  executable(fixture.bin, 'timeout', 'shift\nexec "$@"')
  executable(
    fixture.bin,
    'docker',
    [
      'printf \'%s\\n\' "$*" >> "$TRIVY_LOG"',
      'if [ "$1" = push ]; then',
      '  n=$(cat "$TRIVY_LOG.pushes" 2>/dev/null || echo 0); echo $((n + 1)) > "$TRIVY_LOG.pushes"',
      `  if [ "$n" -lt ${failPushes} ]; then exit 1; fi`,
      `  echo "latest: digest: ${digest} size: 1"`,
      'fi',
    ].join('\n'),
  )
}

describe('image Trivy and publication shell programs', () => {
  afterEach(() => {
    for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('wires the workflow steps to the shell programs covered here', () => {
    const read = (file: string) => readFileSync(resolve(file), 'utf8')
    const backendAction = read(`${backend}/action.yml`)
    const webAction = read(`${web}/action.yml`)
    expect(backendAction).toContain(`run: '"$GITHUB_ACTION_PATH/trivy-scan.sh"'`)
    expect(backendAction).toContain(`run: '"$GITHUB_ACTION_PATH/trivy-sbom.sh"'`)
    expect(webAction).toContain(`run: 'source "$GITHUB_ACTION_PATH/trivy-scan.sh"'`)
    expect(webAction).toContain(`run: 'source "$GITHUB_ACTION_PATH/trivy-sbom.sh"'`)
    expect(read('.github/workflows/publish-backend-images.yml')).toContain(
      `run: bash --noprofile --norc -e -o pipefail ${backend}/publish-images.sh`,
    )
    expect(read('.github/workflows/publish-web-images.yml')).toContain(
      `run: bash --noprofile --norc -e -o pipefail ${web}/publish-image.sh`,
    )
  })

  it.each([
    ['0', 0, ''],
    ['10', 10, '::error title=Trivy OS vulnerability findings::api'],
    ['2', 2, 'Trivy scanner error for one or more images'],
  ])('gates backend OS scans: scanner exit %s', (scannerExit, status, marker) => {
    const fixture = createFixture()
    fakeTrivy(fixture, scannerExit)
    const result = execute(runFile(backend, 'trivy-scan.sh'), fixture, {
      ACTIVE_WORKER_IMAGES: 'worker-cpu',
    })

    expect(result.status).toBe(status)
    const log = readFileSync(fixture.log, 'utf8')
    expect(log).toContain('image --scanners vuln --quiet --pkg-types os --skip-db-update')
    expect(log).toContain('local/fixture/api:sha-1')
    expect(log).toContain('local/fixture/worker-cpu:sha-1')
    expect(result.stdout).toContain(marker)
  })

  it('generates a backend SBOM per image without vulnerability filters', () => {
    const fixture = createFixture()
    fakeTrivy(fixture, '0')
    const result = execute(runFile(backend, 'trivy-sbom.sh'), fixture, {
      ACTIVE_WORKER_IMAGES: 'worker-io',
    })

    expect(result.status).toBe(0)
    expect(readFileSync(fixture.log, 'utf8')).toBe(
      'image --quiet --skip-db-update --exit-code 0 --format cyclonedx --output sbom-api.cdx.json local/fixture/api:sha-1\n' +
        'image --quiet --skip-db-update --exit-code 0 --format cyclonedx --output sbom-worker-io.cdx.json local/fixture/worker-io:sha-1\n',
    )
  })

  it.each([
    ['0', 0, ''],
    ['10', 10, '::error title=Trivy OS vulnerability findings::'],
    ['2', 2, 'Trivy scanner error while scanning OS packages'],
  ])('gates the web OS scan: scanner exit %s', (scannerExit, status, marker) => {
    const fixture = createFixture()
    fakeTrivy(fixture, scannerExit)
    const result = execute(sourceFile(web, 'trivy-scan.sh'), fixture, {})

    expect(result.status).toBe(status)
    expect(readFileSync(fixture.log, 'utf8')).toContain('local/fixture/web:sha-1')
    expect(result.stdout).toContain(marker)
  })

  it('generates the web SBOM without vulnerability filters', () => {
    const fixture = createFixture()
    fakeTrivy(fixture, '0')
    const result = execute(sourceFile(web, 'trivy-sbom.sh'), fixture, {})

    expect(result.status).toBe(0)
    expect(readFileSync(fixture.log, 'utf8')).toBe(
      'image --quiet --skip-db-update --exit-code 0 --format cyclonedx --output sbom-web.cdx.json local/fixture/web:sha-1\n',
    )
  })

  const publishEnv = {
    GHCR_NAMESPACE: 'ghcr.io/owner',
    REGISTRY_PASSWORD: 'token',
    REGISTRY_USERNAME: 'actor',
    ACTIVE_WORKER_IMAGES: 'worker-cpu worker-io',
    MISSING_TARGETS: '["worker-io"]',
  }

  it.each([
    ['merge_group', ['api', 'worker-cpu', 'worker-io']],
    ['push', ['worker-io']],
  ])('publishes backend targets for %s', (eventName, targets) => {
    const fixture = createFixture()
    fakeDocker(fixture)
    executable(fixture.bin, 'jq', "printf 'worker-io\\n'")
    const result = execute(runFile(backend, 'publish-images.sh'), fixture, {
      ...publishEnv,
      GITHUB_EVENT_NAME: eventName,
    })

    expect(result.status).toBe(0)
    const pushed = readFileSync(fixture.log, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('push '))
    expect(pushed).toEqual(targets.map(target => `push ghcr.io/owner/${target}:sha-1`))
    expect(readFileSync(fixture.output, 'utf8')).toBe(
      targets.map(target => `${target.replace('-', '_')}_digest=${digest}\n`).join(''),
    )
    expect(readFileSync(fixture.summary, 'utf8')).toContain('## Published backend images')
  })

  it('rejects an unexpected backend target after pushing it', () => {
    const fixture = createFixture()
    fakeDocker(fixture)
    executable(fixture.bin, 'jq', "printf 'surprise\\n'")
    const result = execute(runFile(backend, 'publish-images.sh'), fixture, {
      ...publishEnv,
      GITHUB_EVENT_NAME: 'push',
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('::error::Unexpected backend image target: surprise')
  })

  it('retries a rejected push and records the web digest', () => {
    const fixture = createFixture()
    fakeDocker(fixture, 2)
    const result = execute(
      runFile('.github/actions/build-web-images', 'publish-image.sh'),
      fixture,
      {
        ...publishEnv,
      },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('::warning::docker push attempt 2 failed; retrying.')
    expect(readFileSync(fixture.output, 'utf8')).toBe(`web_digest=${digest}\n`)
    expect(readFileSync(fixture.summary, 'utf8')).toContain('## Published web image')
  })

  it('fails the web publish after three rejected pushes', () => {
    const fixture = createFixture()
    fakeDocker(fixture, 3)
    const result = execute(
      runFile('.github/actions/build-web-images', 'publish-image.sh'),
      fixture,
      {
        ...publishEnv,
      },
    )

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('failed after 3 attempts.')
    expect(readFileSync(fixture.output, 'utf8')).toBe('')
  })

  it('fails when the push output carries no digest', () => {
    const fixture = createFixture()
    fakeDocker(fixture)
    executable(fixture.bin, 'docker', 'if [ "$1" = push ]; then echo pushed; fi')
    const result = execute(
      runFile('.github/actions/build-web-images', 'publish-image.sh'),
      fixture,
      {
        ...publishEnv,
      },
    )

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('no digest could be read back')
  })
})
