import { describe, expect, it } from 'vitest'

import {
  workflowDownloadIntegrityViolations,
  workflowDownloadPolicyPaths,
} from './check-workflow-download-integrity.mts'

describe('workflow download integrity policy', () => {
  it('reports literal violations for helper, step environment, and composite script downloads', () => {
    const violations = workflowDownloadIntegrityViolations({
      '.github/workflows/helper.yml': `
jobs:
  build:
    steps:
      - run: ci_download_to /tmp/tool https://downloads.example.com/tool
`,
      '.github/workflows/env.yml': `
jobs:
  build:
    steps:
      - env:
          TOOL_URL: https://downloads.example.com/tool
        run: curl -fsSL "$TOOL_URL" -o /tmp/tool
`,
      '.github/actions/tool/action.yml': `
runs:
  using: composite
  steps:
    - run: ./install-tool.sh
      shell: bash
`,
      '.github/actions/tool/install-tool.sh':
        'ci_download_to /tmp/tool https://downloads.example.com/tool\n',
    })

    expect(violations).toEqual([
      '.github/actions/tool/install-tool.sh script step[0]: downloads from downloads.example.com without sha256sum verification (add sha256sum -c after the download, or # integrity-check: skip reason=... on or before the download line)',
      '.github/workflows/env.yml job:build step[0]: downloads from downloads.example.com without sha256sum verification (add sha256sum -c after the download, or # integrity-check: skip reason=... on or before the download line)',
      '.github/workflows/helper.yml job:build step[0]: downloads from downloads.example.com without sha256sum verification (add sha256sum -c after the download, or # integrity-check: skip reason=... on or before the download line)',
    ])
  })

  it('accepts verified, trusted, sidecar, and reasoned exception cases', () => {
    const violations = workflowDownloadIntegrityViolations({
      '.github/workflows/accepted.yml': `
jobs:
  build:
    steps:
      - run: |
          curl -fsSL https://downloads.example.com/tool -o tool
          curl -fsSL https://downloads.example.com/tool.sha256 -o tool.sha256
          sha256sum -c tool.sha256
      - run: wget https://api.github.com/repos/example/tool
      - run: |
          # integrity-check: skip reason=upstream-publishes-no-checksum
          ci_download_to /tmp/tool https://downloads.example.com/tool
      - run: |
          BASE_URL="https://downloads.example.com"
          curl -fsSL "$BASE_URL/tool" -o tool
          shasum -a 256 -c tool.sha256
      - run: wget https://api.github.com:8443/tool
`,
    })

    expect(violations).toEqual([])
  })

  it('selects workflow shell scripts alongside workflow YAML and action scripts', () => {
    expect(
      workflowDownloadPolicyPaths([
        '.github/workflows/helper.yml',
        '.github/workflows/dependency-mirror-install-regctl.sh',
        '.github/workflows/evals-backend/mint-anthropic-token.sh',
        '.github/workflows/README.md',
        '.github/actions/tool/install-tool.sh',
        '.github/actions/tool/action.yml',
        '.github/actions/tool/nested/extra.sh',
        'ci/curl-to.sh',
      ]),
    ).toEqual([
      '.github/workflows/helper.yml',
      '.github/workflows/dependency-mirror-install-regctl.sh',
      '.github/workflows/evals-backend/mint-anthropic-token.sh',
      '.github/actions/tool/install-tool.sh',
      '.github/actions/tool/action.yml',
    ])
  })

  it('reports a continued-line download in a workflow shell script', () => {
    const violations = workflowDownloadIntegrityViolations({
      '.github/workflows/dependency-mirror-install-regctl.sh':
        'curl --fail --silent --show-error --location \\\n  https://github.com/example/tool/releases/download/current/tool \\\n  --output "$REGCTL_PATH"\n',
    })

    expect(violations).toEqual([
      '.github/workflows/dependency-mirror-install-regctl.sh script step[0]: downloads from github.com without sha256sum verification (add sha256sum -c after the download, or # integrity-check: skip reason=... on or before the download line)',
    ])
  })

  it('accepts sha256sum --check after a continued download', () => {
    const violations = workflowDownloadIntegrityViolations({
      '.github/workflows/tool.sh':
        "curl --fail --location \\\n  https://downloads.example.com/tool \\\n  --output tool\nprintf '%s  %s\\n' 'abc' tool | sha256sum --check\n",
    })

    expect(violations).toEqual([])
  })

  it('requires verification before the next unrelated download', () => {
    const violations = workflowDownloadIntegrityViolations({
      '.github/workflows/ordering.yml': `
jobs:
  build:
    steps:
      - run: |
          curl -fsSL https://downloads.example.com/first -o first
          curl -fsSL https://downloads.example.com/second -o second
          sha256sum -c second.sha256
`,
    })

    expect(violations).toEqual([
      '.github/workflows/ordering.yml job:build step[0]: downloads from downloads.example.com without sha256sum verification (add sha256sum -c after the download, or # integrity-check: skip reason=... on or before the download line)',
    ])
  })
})
