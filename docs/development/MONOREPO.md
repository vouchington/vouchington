# Monorepo Map

The Voucha repo is a multi-package monorepo. The root `package.json` provides repo-wide scripts, while runtime packages keep their own `package.json` in the directory that owns the code. This page maps the major package boundaries, agent instruction files, and supporting tooling directories, plus the conventions for naming scripts and proxying commands across packages.

Workspace package dependencies must stay acyclic. `pnpm-workspace.yaml` sets `disallowWorkspaceCycles: true`, so `pnpm install` fails when package manifests introduce cycles even if TypeScript imports would otherwise compile.

## Contents

- <a id="primary-packages"></a>[Primary Packages](reference-monorepo-primary-packages.md)
- <a id="backend-package-scopes"></a>[Backend Package Scopes](reference-monorepo-backend-package-scopes.md)
- <a id="test-and-tooling-directories"></a>[Test And Tooling Directories](reference-monorepo-test-and-tooling-directories.md)
- <a id="global-vs-project-commands"></a>[Global vs. Project Commands](reference-monorepo-global-vs-project-commands.md)
- <a id="cross-references"></a>[Cross-References](reference-monorepo-cross-references.md)
