export function hasSetupBackendPnpmActivationTimeout(log: string): boolean {
  const setupBackendIndex = log.lastIndexOf('Run ./.github/actions/setup-backend')
  if (setupBackendIndex === -1) return false

  const setupBackendLog = log.slice(setupBackendIndex)
  return (
    setupBackendLog.includes('node: ') &&
    setupBackendLog.includes('##[error]The action has timed out.') &&
    /Terminate orphan process: pid \(\d+\) \(npm install pnpm@\d+\.\d+\.\d+\)/.test(setupBackendLog)
  )
}
