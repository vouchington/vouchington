import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const action = readFileSync('.github/actions/load-runner-env/action.yml', 'utf8')
const wrapper = readFileSync('ci/load-runner-env.sh', 'utf8')
const packaged = readFileSync(
  join(
    dirname(require.resolve('vouchington-tooling/package.json')),
    'scripts/gha/load-runner-env.sh',
  ),
  'utf8',
)
const nodeTestOptions = readFileSync('ci/with-node-test-options', 'utf8')
const workflowPaths = readdirSync('.github/workflows')
  .filter(path => path.endsWith('.yml'))
  .map(path => `.github/workflows/${path}`)

describe('load-runner-env action', () => {
  it('injects Filaments worker variable names into the published script', () => {
    expect(action).toContain('ci/load-runner-env.sh')
    expect(action).toContain('WORKER_VAR_NAMES: VITEST_MAX_WORKERS PLAYWRIGHT_MAX_WORKERS')
    expect(wrapper).toContain('VITEST_MAX_WORKERS PLAYWRIGHT_MAX_WORKERS')
    expect(wrapper).toContain('exec-vouchington-gha.sh')
    expect(wrapper).toContain('scripts/gha/load-runner-env.sh')
  })

  it('does not write NODE_OPTIONS through GITHUB_ENV', () => {
    expect(packaged).toContain('NODE_OPTIONS)')
    expect(packaged).toContain('Refusing to load NODE_OPTIONS from')
    expect(packaged).not.toContain('_node_options')
    expect(packaged).not.toContain("printf 'NODE_OPTIONS=%s\\n'")
  })

  it('blocks shell-hijack and loader-hijack variables from GITHUB_ENV', () => {
    expect(packaged).toContain('BASH_ENV | ENV | PATH | LD_* | DYLD_* | GIT_*)')
    expect(packaged).toContain(
      'can hijack shell startup, the dynamic loader, PATH, or git in privileged steps',
    )
  })

  it('keeps CI Node warning suppression out of workflow startup hooks', () => {
    for (const workflowPath of workflowPaths) {
      const workflow = readFileSync(workflowPath, 'utf8')
      expect(workflow).not.toMatch(
        /^\s+BASH_ENV:(?!(?:\s*(?:\/dev\/null|["']\/dev\/null["'])\s*(?:#.*)?$))/m,
      )
      expect(workflow).not.toContain('NODE_OPTIONS: --disable-warning=DEP0205')
    }
    expect(nodeTestOptions).toContain('${NODE_OPTIONS:+$NODE_OPTIONS }--disable-warning=DEP0205')
    expect(nodeTestOptions).toContain('*" --disable-warning=DEP0205 "*)')
  })
})
