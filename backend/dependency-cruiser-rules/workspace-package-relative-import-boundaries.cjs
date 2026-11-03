'use strict'

/**
 * Forbids relative imports that escape a workspace package root.
 *
 * Each workspace package declares the packages it uses in its own manifest, and the image build
 * resolves the executables' module graphs through those declarations (the `workspaces` field
 * below names the same packages). A relative import escaping the package root bypasses the
 * declaration, so the package root stays a boundary and siblings are imported by package name.
 *
 * One forbidden rule is generated per package listed in backend/package.json's
 * `workspaces` field, because dependency-cruiser `path` restrictions cannot reference a capture
 * group from `from` inside `to` — each package root needs its own from/to pair. The backend hub
 * itself (backend/package.json's own directory) is not a listed workspace entry and is
 * intentionally excluded: its non-package files are out of scope for this invariant.
 */

const fs = require('node:fs')
const path = require('node:path')

// No realpath normalization: this assumes `backend/` itself is never reached through a
// symlink (Node resolves __dirname from the actual file location dependency-cruiser loads,
// which is the real repo checkout in every known deployment and CI environment — a git
// worktree's `backend` dir is a real directory, not a symlink into another worktree).
const backendDir = path.join(__dirname, '..')
const repoRoot = path.join(backendDir, '..')

// The dedicated test-helper workspace, test files, and declaration files never ship in the
// runtime image, so an escaping relative import in one cannot reach production.
// dependency-cruiser reports `from.path` as a POSIX repo-relative path regardless of
// host OS, so this pattern is POSIX-only (`/`) by design — no `[\\/]` alternation needed.
const NON_RUNTIME_SOURCE_PATTERN =
  '^backend/test-helpers/|^backend/scripts/check-materialized-view-contracts\\.mts$|' +
  '^backend/scripts/native-mv-contracts/|(?:^|/)__tests__/|\\.test\\.|\\.d\\.[mc]?ts$'

function toRepoRelativePosix(absoluteDir) {
  return path.relative(repoRoot, absoluteDir).split(path.sep).join('/')
}

function expandWorkspacePattern(pattern) {
  const absolutePattern = path.resolve(backendDir, pattern)
  if (!pattern.includes('*')) return [absolutePattern]

  const beforeStar = pattern.slice(0, pattern.indexOf('*'))
  const baseDir = path.resolve(backendDir, beforeStar)
  if (!fs.existsSync(baseDir)) return []

  const directories = []
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (entry.isDirectory()) directories.push(path.join(baseDir, entry.name))
  }
  return directories
}

function discoverWorkspacePackageRoots() {
  const backendPackageJson = JSON.parse(
    fs.readFileSync(path.join(backendDir, 'package.json'), 'utf8'),
  )
  const roots = new Set()

  for (const pattern of backendPackageJson.workspaces ?? []) {
    for (const directory of expandWorkspacePattern(pattern)) {
      if (!fs.existsSync(path.join(directory, 'package.json'))) continue
      roots.add(toRepoRelativePosix(directory))
    }
  }

  // A typo in backend/package.json's `workspaces` field (or a workspace pattern matching
  // nothing) would otherwise silently produce zero rules below — module.exports = [] — and
  // dep-cruise:backend would stay green forever with this whole guard effectively disabled.
  if (roots.size === 0) {
    throw new Error(
      'workspace-package-relative-import-boundaries.cjs discovered zero workspace package ' +
        "roots from backend/package.json's `workspaces` field. This would silently disable " +
        'every workspace-package-boundary-* forbidden rule. Check that `workspaces` still ' +
        'lists real, existing package directories.',
    )
  }

  return [...roots].toSorted()
}

module.exports = discoverWorkspacePackageRoots().map(packageRoot => {
  const escapedPrefix = RegExp.escape(`${packageRoot}/`)
  return {
    name: `workspace-package-boundary-${packageRoot.replace(/\//g, '-')}`,
    comment:
      `${packageRoot} declares the packages it uses in its own manifest. A relative import ` +
      'escaping the package root bypasses that declaration. Import sibling workspace ' +
      'packages by their package name instead.',
    severity: 'error',
    from: {
      path: `^${escapedPrefix}`,
      pathNot: NON_RUNTIME_SOURCE_PATTERN,
    },
    to: {
      pathNot: `^${escapedPrefix}`,
      dependencyTypes: ['local'],
      dependencyTypesNot: ['type-only'],
    },
  }
})
