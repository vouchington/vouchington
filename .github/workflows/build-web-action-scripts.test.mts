import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const fixtures: string[] = []
const actionDirectory = '.github/actions/build-web-images'
const action = parse(readFileSync(`${actionDirectory}/action.yml`, 'utf8')) as {
  runs: { steps: Array<{ env?: Record<string, string> }> }
}
const trivyVersion = action.runs.steps.find(step => step.env?.TRIVY_VERSION)?.env?.TRIVY_VERSION
if (!trivyVersion) throw new Error('Web image action must declare its scanner version')

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'build-web-image-action-'))
  fixtures.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  return { root, bin }
}

function executable(bin: string, name: string, body: string): void {
  writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 })
}

function run(script: string, root: string, bin: string, env: Record<string, string> = {}) {
  return spawnSync('/bin/bash', [resolve(actionDirectory, script)], {
    encoding: 'utf8',
    env: { ...process.env, ...env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` },
    cwd: root,
  })
}

describe('web image composite action shell programs', () => {
  afterEach(() => {
    for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('reports the inspected image size in the job summary', () => {
    const { root, bin } = createFixture()
    const summary = join(root, 'summary')
    executable(bin, 'docker', 'printf "1048576\\n"')
    executable(bin, 'numfmt', 'printf "1.0MiB\\n"')

    const result = run('report-image-size.sh', root, bin, {
      IMAGE_REPOSITORY: 'local/fixture',
      IMAGE_TAG: 'sha',
      GITHUB_STEP_SUMMARY: summary,
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('Web image size: 1.0MiB (1048576 bytes)\n')
    expect(readFileSync(summary, 'utf8')).toBe(
      '## Docker Image Size\n\n- Image: `local/fixture/web:sha`\n- Size: `1.0MiB` (1048576 bytes)\n',
    )
  })

  it('accepts an installed Trivy version without fetching an archive', () => {
    const { root, bin } = createFixture()
    executable(bin, 'trivy', 'printf "Version: %s\\n" "$TRIVY_VERSION"')
    executable(bin, 'uname', 'exit 9')

    const result = run('install-trivy.sh', root, bin, { TRIVY_VERSION: trivyVersion })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe(`trivy ${trivyVersion} already installed\n`)
  })

  it('reports an unsupported Trivy install platform before any download', () => {
    const { root, bin } = createFixture()
    executable(bin, 'trivy', 'exit 1')
    executable(bin, 'uname', 'printf "OtherOS\\n"')

    const result = run('install-trivy.sh', root, bin, { TRIVY_VERSION: trivyVersion })

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('Unsupported platform: OtherOS-OtherOS\n')
  })

  it('fails the Trivy guard and records the missing scanner', () => {
    const { root, bin } = createFixture()
    const summary = join(root, 'summary')
    const result = spawnSync('/bin/bash', [resolve(actionDirectory, 'trivy-install-guard.sh')], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: `${bin}:/usr/bin:/bin`, GITHUB_STEP_SUMMARY: summary },
    })

    expect(result.status).toBe(1)
    expect(readFileSync(summary, 'utf8')).toBe(
      '✗ Trivy was not installed — container scans cannot run.\n',
    )
  })

  it.each([
    { html: '<main>ready</main>', status: 0, message: 'test attributes are successfully stripped' },
    {
      html: '<main data-testid="leak">ready</main>',
      status: 1,
      message: 'unstripped test attributes',
    },
  ])(
    'checks the smoke response and cleans up the container: $html',
    ({ html, status, message }) => {
      const { root, bin } = createFixture()
      const dockerLog = join(root, 'docker.log')
      executable(bin, 'python3', 'printf "4171 4172\\n"')
      executable(
        bin,
        'node',
        'if [[ "$1" == *localization-smoke-backend.mts ]]; then exec /usr/bin/tail -f /dev/null; fi',
      )
      executable(
        bin,
        'docker',
        'printf "%s\\n" "$*" >> "$DOCKER_LOG"\nif [[ "$1" == run ]]; then printf "fixture-container\\n"; fi',
      )
      executable(
        bin,
        'curl',
        'if [[ " $* " == *" -w "* ]]; then printf "200"; elif [[ " $* " == *" -sS http://localhost:4171/ "* ]]; then printf "%s\\n" "$SMOKE_HTML"; fi',
      )

      const result = run('smoke-test.sh', root, bin, {
        IMAGE_REPOSITORY: 'local/fixture',
        IMAGE_TAG: 'sha',
        RUNNER_TEMP: root,
        DOCKER_LOG: dockerLog,
        SMOKE_HTML: html,
      })

      expect(result.status).toBe(status)
      expect(result.stdout).toContain(message)
      expect(readFileSync(dockerLog, 'utf8')).toContain('run -d -p 4171:3000')
      expect(readFileSync(dockerLog, 'utf8')).toContain('exec fixture-container node -e')
      expect(readFileSync(dockerLog, 'utf8')).toContain('stop fixture-container')
      expect(readFileSync(dockerLog, 'utf8')).toContain('rm fixture-container')
    },
  )
})
