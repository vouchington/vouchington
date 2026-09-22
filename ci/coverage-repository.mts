export const VOUCHINGTON_REPOSITORY = 'vouchington/vouchington'

export function coverageRepository(env: NodeJS.ProcessEnv): string {
  return env.GITHUB_REPOSITORY || VOUCHINGTON_REPOSITORY
}
