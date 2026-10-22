type NodeDiagnostics = typeof import('vouchington-tooling/vitest-diagnostics')

// The specifier is a variable so Vite's dependency scanner does not pull the Node-only
// diagnostics entry into the Storybook browser bundle.
const nodeDiagnosticsEntry = 'vouchington-tooling/vitest-diagnostics'

// Node and jsdom have the builtin hook. The Storybook browser bundle does not.
export async function loadNodeDiagnostics(): Promise<NodeDiagnostics | null> {
  if (typeof process === 'undefined' || typeof process.getBuiltinModule !== 'function') return null
  return (await import(/* @vite-ignore */ nodeDiagnosticsEntry)) as NodeDiagnostics
}
