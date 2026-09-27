import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'

const allFilters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as Record<
  string,
  string[]
>

export const primaryPathFilters = Object.fromEntries(
  Object.entries(allFilters).filter(([name]) => !name.startsWith('runtime-')),
)

export const runtimePathFilters = Object.fromEntries(
  Object.entries(allFilters).flatMap(([name, globs]) =>
    name.startsWith('runtime-') ? [[name.slice('runtime-'.length), globs]] : [],
  ),
)
