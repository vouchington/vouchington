import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const action = readFileSync('.github/actions/setup-lychee/action.yml', 'utf8')

describe('setup-lychee action', () => {
  it('installs the pinned lychee release through install-github-release', () => {
    expect(action).toContain('LYCHEE_VERSION:')
    expect(action).toContain('ci/install-github-release.sh')
    expect(action).toContain('--repo lycheeverse/lychee')
    expect(action).toContain("--asset 'lychee-{platform}.tar.gz'")
    expect(action).toContain("--tag-prefix 'lychee-v'")
    expect(action).toContain('--bin lychee')
    expect(action).toContain('--bin-dir "$LYCHEE_BIN_DIR"')
  })

  it('installs lychee into a per-job bin directory', () => {
    expect(action).toContain('LYCHEE_BIN_DIR="${RUNNER_TEMP:-$HOME/.local}/bin"')
    expect(action).toContain('echo "$LYCHEE_BIN_DIR" >> "$GITHUB_PATH"')
    expect(action).not.toContain('mkdir -p ~/.local/bin')
    expect(action).not.toContain('echo "$HOME/.local/bin" >> "$GITHUB_PATH"')
    expect(action).not.toContain('/tmp/lychee.tar.gz')
  })
})
