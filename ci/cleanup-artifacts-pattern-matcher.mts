const SUPPORTED_PATTERN = /^[A-Za-z0-9._-]+\*?$/

export function createArtifactPatternMatcher(
  patterns: readonly string[],
): (name: string) => boolean {
  const matchers = patterns.map(pattern => {
    if (!SUPPORTED_PATTERN.test(pattern) || pattern.endsWith('**')) {
      throw new Error(
        `unsupported artifact pattern ${JSON.stringify(pattern)}; use an exact name or one trailing *`,
      )
    }

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      return (name: string) => name.startsWith(prefix)
    }
    return (name: string) => name === pattern
  })

  return (name: string) => matchers.some(matches => matches(name))
}
