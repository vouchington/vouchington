import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const fixtures: string[] = []

function createFixture(): { root: string; bin: string } {
  const root = mkdtempSync(join(tmpdir(), 'build-infra-action-'))
  fixtures.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  return { root, bin }
}

function writeExecutable(path: string, source: string | readonly string[]): void {
  const body = typeof source === 'string' ? source : source.join('\n')
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, { mode: 0o755 })
}

function runScript(script: string, root: string, bin: string, env: Record<string, string> = {}) {
  return spawnSync('/bin/bash', [resolve(script)], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    },
  })
}

function actionScript(actionPath: string, stepName: string): string {
  const action = parseYaml(readFileSync(resolve(actionPath), 'utf8')) as {
    runs?: { steps?: Array<{ name?: string; run?: string }> }
  }
  const step = action.runs?.steps?.find(candidate => candidate.name === stepName)
  const match = step?.run && /^bash "\$GITHUB_WORKSPACE\/(.+)"$/.exec(step.run)
  if (!match) throw new TypeError(`${actionPath} step ${stepName} must run a workspace script`)
  return match[1]
}

const scripts = {
  mode: actionScript(
    '.github/actions/build-web-targets/action.yml',
    'Validate shared build cache mode',
  ),
  restored: actionScript(
    '.github/actions/build-web-targets/action.yml',
    'Validate restored web build runtime paths',
  ),
  build: actionScript('.github/actions/build-web-targets/action.yml', 'Build web targets'),
  valkey: actionScript('.github/actions/start-valkey/action.yml', 'Start Valkey'),
}

describe('composite build infrastructure shell scripts', () => {
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true })
  })

  it('wires the composite steps to the shell scripts covered here', () => {
    expect([scripts.mode, scripts.restored, scripts.build, scripts.valkey]).toEqual([
      'ci/build-infra/validate-shared-build-cache-mode.sh',
      'ci/build-infra/validate-restored-web-targets.sh',
      'ci/build-infra/build-web-targets.sh',
      'ci/build-infra/start-valkey.sh',
    ])
  })

  it.each(['producer', 'consumer'] as const)('accepts the %s cache mode', mode => {
    const { root, bin } = createFixture()
    const result = runScript(scripts.mode, root, bin, {
      SHARED_BUILD_CACHE_MODE: mode,
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('rejects an unknown cache mode and includes the supplied value in the diagnostic', () => {
    const { root, bin } = createFixture()
    const result = runScript(scripts.mode, root, bin, {
      SHARED_BUILD_CACHE_MODE: 'invalid-mode',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toBe(
      'shared-build-cache-mode must be producer or consumer; got invalid-mode\n',
    )
  })

  it('marks the restored cache complete only after a successful bounded manifest check', () => {
    const { root, bin } = createFixture()
    const output = join(root, 'github-output')
    const argsLog = join(root, 'python-args')
    writeExecutable(
      join(bin, 'python3'),
      'printf \'%s\\n\' "$*" >> "$PYTHON_ARGS_LOG"\nexit "${PYTHON_EXIT:-0}"\n',
    )
    writeFileSync(output, '')
    const baseEnv = { GITHUB_WORKSPACE: root, GITHUB_OUTPUT: output, PYTHON_ARGS_LOG: argsLog }

    const hit = runScript(scripts.restored, root, bin, {
      ...baseEnv,
      CACHE_HIT: 'true',
      PYTHON_EXIT: '0',
    })
    expect(hit.status).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe('complete=true\n')
    expect(readFileSync(argsLog, 'utf8')).toBe(
      `${root}/node_modules/vouchington-tooling/scripts/run-bounded.py 30 node ci/web-build-cache-manifest.mts verify\n`,
    )

    writeFileSync(output, '')
    const miss = runScript(scripts.restored, root, bin, {
      ...baseEnv,
      CACHE_HIT: 'false',
    })
    expect(miss.status).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe('complete=false\n')
    expect(readFileSync(argsLog, 'utf8')).toContain('ci/web-build-cache-manifest.mts verify\n')
    expect(readFileSync(argsLog, 'utf8').match(/run-bounded\.py/g)).toHaveLength(1)

    writeFileSync(output, '')
    const invalid = runScript(scripts.restored, root, bin, {
      ...baseEnv,
      CACHE_HIT: 'true',
      PYTHON_EXIT: '7',
    })
    expect(invalid.status).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe('complete=false\n')
  })

  it('sources the workspace env file, then applies the existing build overrides and deadline', () => {
    const { root, bin } = createFixture()
    const envLog = join(root, 'python-env')
    writeFileSync(
      join(root, '.env'),
      'FROM_DOTENV=loaded\nNEXT_TEST_BUILD=1\nNEXT_PUBLIC_ASSET_PREFIX=from-dotenv\n',
    )
    writeExecutable(join(bin, 'python3'), [
      'printf "args=%s\\n" "$*" >> "$PYTHON_ENV_LOG"',
      'printf "dotenv=%s\\nnext_test=%s\\nasset_prefix=<%s>\\ncache_enabled=%s\\ntimings=%s\\n" "$FROM_DOTENV" "$NEXT_TEST_BUILD" "$NEXT_PUBLIC_ASSET_PREFIX" "$WEB_BUILD_FS_CACHE_ENABLED" "$VOUCHINGTON_SETUP_WEB_TIMINGS_JSON" >> "$PYTHON_ENV_LOG"',
    ])
    const result = runScript(scripts.build, root, bin, {
      GITHUB_WORKSPACE: root,
      PYTHON_ENV_LOG: envLog,
      WEB_BUILD_FS_CACHE_ENABLED: 'true',
      VOUCHINGTON_SETUP_WEB_TIMINGS_JSON: '/runner/temp/web-build-timings.json',
    })

    expect(result.status).toBe(0)
    expect(readFileSync(envLog, 'utf8')).toBe(
      [
        `args=${root}/node_modules/vouchington-tooling/scripts/run-bounded.py 300 node ci/setup-web-integration.mts`,
        'dotenv=loaded',
        'next_test=0',
        'asset_prefix=<>',
        'cache_enabled=true',
        'timings=/runner/temp/web-build-timings.json',
        '',
      ].join('\n'),
    )
  })

  it('starts Valkey with the configured image, bounded readiness, tmpfs, and exported URL', () => {
    const { root, bin } = createFixture()
    const dockerLog = join(root, 'docker-argv')
    const timeoutLog = join(root, 'timeout-argv')
    const githubEnv = join(root, 'github-env')
    const githubOutput = join(root, 'github-output')
    const image = 'ghcr.io/example/dependency-valkey@sha256:synthetic-test-digest'
    writeExecutable(join(bin, 'docker'), [
      'printf "<%s>" "$@" >> "$DOCKER_ARGV_LOG"',
      'printf "\\n" >> "$DOCKER_ARGV_LOG"',
      'if [[ "${1-}" == "port" ]]; then printf "127.0.0.1:%s\\n" "$FAKE_DOCKER_PORT"; fi',
    ])
    writeExecutable(join(bin, 'timeout'), [
      'printf "<%s>" "$@" >> "$TIMEOUT_ARGV_LOG"',
      'printf "\\n" >> "$TIMEOUT_ARGV_LOG"',
      'if [[ "${1-}" == "--kill-after=2s" ]]; then shift 2; exec "$@"; fi',
      'if [[ "${1-}" == "20" ]]; then shift; if [[ "$FAKE_READINESS_TIMEOUT" == "true" ]]; then exit 124; fi; exec "$@"; fi',
      'echo "unexpected timeout arguments" >&2',
      'exit 99',
    ])
    writeFileSync(githubEnv, '')
    writeFileSync(githubOutput, '')
    const baseEnv = {
      GITHUB_WORKSPACE: root,
      VALKEY_IMAGE: image,
      VALKEY_CONTAINER: 'voucha-valkey-test',
      GITHUB_ENV: githubEnv,
      GITHUB_OUTPUT: githubOutput,
      DOCKER_ARGV_LOG: dockerLog,
      TIMEOUT_ARGV_LOG: timeoutLog,
      FAKE_DOCKER_PORT: '49152',
      FAKE_READINESS_TIMEOUT: 'false',
    }
    const result = runScript(scripts.valkey, root, bin, baseEnv)

    expect(result.status).toBe(0)
    const dockerCalls = readFileSync(dockerLog, 'utf8')
    expect(dockerCalls).toContain(`<pull><${image}>`)
    expect(dockerCalls).toContain(
      `<run><--pull=never><-d><--name><voucha-valkey-test><-p><127.0.0.1::6379><--tmpfs></data:rw,size=64m><${image}>`,
    )
    expect(dockerCalls).toContain('<exec><voucha-valkey-test><valkey-cli><ping>')
    expect(dockerCalls).toContain('<exec><voucha-valkey-test><valkey-cli><config><set><save><>')
    expect(dockerCalls).toContain('<port><voucha-valkey-test><6379/tcp>')
    expect(readFileSync(timeoutLog, 'utf8')).toBe(
      `<--kill-after=2s><90s><docker><pull><${image}>\n<20><sh><-c><until docker exec "$0" valkey-cli ping >/dev/null 2>&1; do sleep 0.5; done><voucha-valkey-test>\n`,
    )
    expect(readFileSync(githubEnv, 'utf8')).toBe('VALKEY_URL=redis://127.0.0.1:49152\n')
    expect(readFileSync(githubOutput, 'utf8')).toBe('url=redis://127.0.0.1:49152\n')
  })

  it('fails on readiness timeout and emits the container diagnostic', () => {
    const { root, bin } = createFixture()
    const dockerLog = join(root, 'docker-argv')
    const timeoutLog = join(root, 'timeout-argv')
    writeExecutable(join(bin, 'docker'), [
      'printf "<%s>" "$@" >> "$DOCKER_ARGV_LOG"',
      'printf "\\n" >> "$DOCKER_ARGV_LOG"',
      'if [[ "${1-}" == "logs" ]]; then',
      '  echo "# <search> [warning], tid: 1, /vmsdk/src/info.cc:205: Defined Info Field: agg_apply_records Flags:6"',
      '  echo "# Failed to bind port" >&2',
      'fi',
    ])
    writeExecutable(join(bin, 'timeout'), [
      'printf "<%s>" "$@" >> "$TIMEOUT_ARGV_LOG"',
      'printf "\\n" >> "$TIMEOUT_ARGV_LOG"',
      'if [[ "${1-}" == "--kill-after=2s" ]]; then shift 2; exec "$@"; fi',
      'if [[ "${1-}" == "20" ]]; then exit 124; fi',
      'exit 99',
    ])
    const result = runScript(scripts.valkey, root, bin, {
      GITHUB_WORKSPACE: root,
      VALKEY_IMAGE: 'ghcr.io/example/dependency-valkey@sha256:synthetic-test-digest',
      VALKEY_CONTAINER: 'voucha-valkey-test',
      GITHUB_ENV: join(root, 'github-env'),
      GITHUB_OUTPUT: join(root, 'github-output'),
      DOCKER_ARGV_LOG: dockerLog,
      TIMEOUT_ARGV_LOG: timeoutLog,
      FAKE_READINESS_TIMEOUT: 'true',
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('::error::Valkey did not answer PING within 20s\n')
    expect(result.stdout).toContain('# Failed to bind port\n')
    expect(result.stdout).not.toContain('Defined Info Field')
    expect(readFileSync(dockerLog, 'utf8')).toContain('<logs><voucha-valkey-test>')
    expect(readFileSync(dockerLog, 'utf8')).not.toContain('<port>')
  })

  it('rejects a nonnumeric published Valkey port', () => {
    const { root, bin } = createFixture()
    writeExecutable(
      join(bin, 'docker'),
      'if [[ "${1-}" == "port" ]]; then echo 127.0.0.1:unknown; fi\n',
    )
    writeExecutable(join(bin, 'timeout'), [
      'if [[ "${1-}" == "--kill-after=2s" ]]; then shift 2; exec "$@"; fi',
      'shift',
      'exec "$@"',
    ])
    const result = runScript(scripts.valkey, root, bin, {
      GITHUB_WORKSPACE: root,
      VALKEY_IMAGE: 'ghcr.io/example/dependency-valkey@sha256:synthetic-test-digest',
      VALKEY_CONTAINER: 'voucha-valkey-test',
      GITHUB_ENV: join(root, 'github-env'),
      GITHUB_OUTPUT: join(root, 'github-output'),
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('::error::Could not resolve the published Valkey host port\n')
  })
})
