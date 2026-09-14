const gitWorktreeOverrideEnvNames = new Set<string>([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
])

export function gitEnvWithoutWorktreeOverrides(): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !gitWorktreeOverrideEnvNames.has(key)),
    ),
    NODE_ENV: process.env.NODE_ENV,
  }
}
