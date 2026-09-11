const selectedVitestProjects = (argv: string[]): string[] =>
  argv.flatMap((arg, index) => {
    if (arg === '--project') {
      const value = argv[index + 1]
      return value && !value.startsWith('-') ? [value] : []
    }
    return arg.startsWith('--project=') ? [arg.slice('--project='.length)] : []
  })

export const vitestCoverageScope = (argv = process.argv): string | undefined => {
  const configuredScope = process.env.VITEST_COVERAGE_SCOPE
  if (configuredScope) return configuredScope
  const projects = selectedVitestProjects(argv)
  return projects.length === 1 && projects[0] === 'web' ? 'web' : undefined
}
