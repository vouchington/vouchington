# Adding a new pinned binary

[Back to Dependency Updates](dependency-updates.md#adding-a-new-pinned-binary)

If you add a CI step that downloads a binary by version, prefer this order:

1. **Use a maintained GitHub Action.** Its `@vX.Y.Z` ref is auto-tracked by Dependabot's `github-actions` ecosystem with no extra config.
2. **Inline curl/tar with a Renovate annotation.** Hoist the version into the step's `env:` block and put the annotation comment immediately above the `KEY: value` line:

   ```yaml
   - name: Install foo
     env:
       # renovate: datasource=github-releases depName=acme/foo extractVersion=^v(?<version>.*)$
       FOO_VERSION: 1.2.3
     run: |
       curl -fL "https://github.com/acme/foo/releases/download/v${FOO_VERSION}/foo.tar.gz" -o /tmp/foo.tar.gz
       …
   ```

   The workflow-env regex customManager in `renovate.json` matches any `# renovate:` annotation immediately above an `ENV_NAME: value` line in `.github/workflows/*.yml` and `.github/actions/*/action.yml`. No new manager entry is required.

3. **Dockerfile ARG.** Use the same `# renovate:` annotation immediately above an `ARG NAME=value` line. The Dockerfile-ARG regex customManager in `renovate.json` matches any `**/Dockerfile`. No new manager entry is required.

4. **Anything else** (shell scripts, JSON, TOML…) — add a focused regex customManager to `renovate.json` scoped to that file. For comment-capable formats, keep the annotation comment one line above the value. Strict JSON cannot carry comments, so hardcode `datasourceTemplate` and `depNameTemplate` in its focused manager instead; the root `package.json` pnpm manager is the reference pattern.
