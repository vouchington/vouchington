export type ProbeStatus = {
  checked: boolean
  message?: string
  ok: boolean
}

export type DbBackedTestSetupInput = {
  cwd: string
  databaseProbe?: ProbeStatus
  env: NodeJS.ProcessEnv
  files: {
    env: boolean
    initialized: boolean
  }
  gitTopLevel: string | null
  identityProbe?: ProbeStatus
  initializedMode: string | null
  isMainWorktree: boolean
  worktreeDir: string
  schemaProbe?: ProbeStatus
  valkeyProbe?: ProbeStatus
}

export type CollectDbBackedTestSetupOptions = {
  probeServices?: boolean
}
