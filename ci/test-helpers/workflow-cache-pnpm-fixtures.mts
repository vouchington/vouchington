export const workflow = '.github/workflows/'
export const action = '.github/actions/'
export const setup = 'vouchington/vouchington-tooling/.github/actions/setup-node-pnpm@sha'
const scriptFree = [
  'fix-main-self-retry.yml#retry',
  'fix-main.yml#classify-self-failure',
  'fix-main.yml#related-candidates',
  'fix-main.yml#render-prompt',
  'fix-main.yml#triage-and-rerun',
  'plan-completion.yml#audit',
]
export const base = new Map<string, string>([
  ...scriptFree
    .map(owner => {
      const [file, job] = owner.split('#')
      return [
        `${workflow}${file}`,
        `jobs:\n  ${job}:\n    steps:\n      - uses: ${setup}\n        with:\n          install-scripts: 'false'\n`,
      ] as const
    })
    .reduce(
      (map, [path, source]) =>
        map.set(path, `${map.get(path) ?? 'jobs:\n'}${source.replace(/^jobs:\n/, '')}`),
      new Map<string, string>(),
    ),
  [
    `${workflow}postgresql-snapshot-update.yml`,
    'jobs:\n  generate:\n    steps:\n      - run: pnpm install --frozen-lockfile\n',
  ],
  [
    `${workflow}explain-analyze.yml`,
    'jobs:\n  analyze:\n    steps:\n      - name: Upload EXPLAIN ANALYZE results\n        if: always()\n        run: echo results\n',
  ],
  [
    `${workflow}test.yml`,
    `jobs:
  browser:
    steps:
      - uses: actions/setup-node@${'a'.repeat(40)} # v6
        with:
          node-version-file: '.nvmrc'
          package-manager-cache: false
      - uses: ${setup}
      - id: hash
        run: echo "lockfile-hash=$(sha256sum pnpm-lock.yaml)" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@sha
        with:
          path: ~/.cache/ms-playwright
          key: \${{ runner.os }}-\${{ runner.arch }}-\${{ steps.hash.outputs.lockfile-hash }}
      - name: Install browsers
        run: pnpm exec playwright install chromium
      - uses: docker/build-push-action@sha
        env:
          BUILDX_METADATA_PROVENANCE: disabled
`,
  ],
  [
    `${action}build-web-images/action.yml`,
    "runs:\n  using: composite\n  steps:\n    - uses: docker/build-push-action@sha\n      env:\n        BUILDX_METADATA_PROVENANCE: disabled\n        DOCKER_BUILD_RECORD_UPLOAD: 'false'\n        DOCKER_BUILD_SUMMARY: 'false'\n",
  ],
  [
    `${action}build-backend-images/action.yml`,
    "runs:\n  using: composite\n  steps:\n    - uses: docker/bake-action@sha\n      env:\n        BUILDX_METADATA_PROVENANCE: disabled\n        DOCKER_BUILD_RECORD_UPLOAD: 'false'\n",
  ],
  [
    `${action}build-web-targets/action.yml`,
    `runs:\n  using: composite\n  steps:\n    - uses: ${setup}\n`,
  ],
])

export function changed(path: string, source: string): Map<string, string> {
  return new Map([...base, [path, source]])
}
