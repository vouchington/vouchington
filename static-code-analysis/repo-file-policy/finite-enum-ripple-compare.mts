import type { FiniteEnumFiles, ReadTrackedFile, RoutedPage } from './finite-enum-ripple-model.mts'

const CHECKLIST = 'docs/development/finite-enum-ripple-checklist.md'

export function hasAllFiles(files: FiniteEnumFiles, paths: readonly string[]): boolean {
  return paths.every(file => files.existingFileSet.has(file))
}

export function checkPostCreatePageTypes(
  errors: string[],
  routeConfigs: { pluralPath: string; postTypes: string[] }[],
  pages: readonly RoutedPage[],
  readTracked: ReadTrackedFile,
): void {
  const typeByPluralPath = new Map(
    routeConfigs.flatMap(config =>
      config.postTypes.length === 1 ? [[config.pluralPath, config.postTypes[0]] as const] : [],
    ),
  )
  for (const page of pages) {
    const expectedType = typeByPluralPath.get(page.slug)
    if (!expectedType) continue
    const content = readTracked(page.file)
    for (const actualType of collectPostCreateTypeLiterals(content)) {
      if (actualType === expectedType) continue
      errors.push(
        finiteEnumError(
          page.file,
          `post create page literal uses "${actualType}" but ${page.slug} expects "${expectedType}"`,
        ),
      )
    }
  }
}

export function collectPostCreateTypeLiterals(content: string): string[] {
  return [
    ...content.matchAll(/\bpostType\s*=\s*['"]([^'"]+)['"]/g),
    ...content.matchAll(/\baction\s*:\s*['"]([^'"]+)['"]/g),
  ].map(item => item[1])
}

export function checkCollectionPagePathLiterals(
  pages: readonly RoutedPage[],
  errors: string[],
  group: 'posts' | 'topics',
  routeSlugs: ReadonlySet<string>,
  readTracked: ReadTrackedFile,
): void {
  for (const page of pages) {
    if (!routeSlugs.has(page.slug)) continue
    const content = readTracked(page.file)
    for (const literalPath of [...content.matchAll(/\bpath:\s*['"]\/([^'"]*)['"]/g)].map(
      item => item[1],
    )) {
      if (!literalPath || literalPath === page.slug || literalPath.startsWith(`${page.slug}/`))
        continue
      errors.push(
        finiteEnumError(
          page.file,
          `${group} collection path literal "/${literalPath}" does not match route directory "${page.slug}"`,
        ),
      )
    }
  }
}

export function checkTopicCollectionComponentPathLiterals(
  errors: string[],
  routeConfigs: { pluralPath: string; singularPath: string }[],
  componentFiles: readonly string[],
  readTracked: ReadTrackedFile,
): void {
  const configByPluralPath = new Map(routeConfigs.map(config => [config.pluralPath, config]))
  for (const file of componentFiles) {
    const match = /^web\/components\/([^/]+)\/.*\.[cm]?[tj]sx?$/.exec(file)
    const config = match ? configByPluralPath.get(match[1]) : undefined
    if (!config) continue
    const content = readTracked(file)
    for (const literalPath of collectNavigationPathLiterals(content)) {
      const firstSegment = literalPath.split('/')[0]
      if (firstSegment === config.pluralPath || firstSegment === config.singularPath) continue
      errors.push(
        finiteEnumError(
          file,
          `topic component navigation path "/${literalPath}" does not match route config "${config.singularPath}" or "${config.pluralPath}"`,
        ),
      )
    }
  }
}

export function collectNavigationPathLiterals(content: string): string[] {
  const paths: string[] = []
  for (const match of content.matchAll(/\b(?:push|replace|redirect)\(\s*['"`]\/([^'"`$)}]+)/g)) {
    const literalPath = match[1]
    if (literalPath && literalPath !== 'login') paths.push(literalPath)
  }
  return paths
}

export function compareSets(
  errors: string[],
  options: {
    label: string
    actualLabel: string
    actualValues: readonly string[]
    expectedLabel: string
    expectedValues: readonly string[]
  },
): void {
  for (const duplicate of duplicateValues(options.actualValues)) {
    errors.push(
      finiteEnumError(
        options.actualLabel,
        `${options.label} duplicate in actual values: ${duplicate}`,
      ),
    )
  }
  for (const duplicate of duplicateValues(options.expectedValues)) {
    errors.push(
      finiteEnumError(
        options.expectedLabel,
        `${options.label} duplicate in expected values: ${duplicate}`,
      ),
    )
  }

  const actual = uniqueSorted(options.actualValues)
  const expected = uniqueSorted(options.expectedValues)
  const missing = expected.filter(value => !actual.includes(value))
  const extra = actual.filter(value => !expected.includes(value))
  if (missing.length === 0 && extra.length === 0) return

  const parts = [
    `${options.label} mismatch`,
    missing.length > 0 ? `missing from ${options.actualLabel}: ${missing.join(', ')}` : '',
    extra.length > 0 ? `stale in ${options.actualLabel}: ${extra.join(', ')}` : '',
    `expected from ${options.expectedLabel}: ${expected.join(', ')}`,
  ].filter(Boolean)
  errors.push(finiteEnumError(options.actualLabel, parts.join('; ')))
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted()
}

export function routePageSlugs(pages: readonly RoutedPage[], topOnly = false): string[] {
  const slugs = new Set<string>()
  for (const page of pages) {
    if (!topOnly || page.isTopLevel) slugs.add(page.slug)
  }
  return [...slugs].toSorted()
}

export function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].toSorted()
}

export function finiteEnumError(file: string, message: string): string {
  return `::error file=${file}::${file}: ${message}. Follow ${CHECKLIST}.`
}
