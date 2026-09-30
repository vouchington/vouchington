export interface SyntheticIssue {
  exports?: readonly string[]
  file: string
  /** Extra issue fields, for example `{ enumMembers: [{ name: 'A' }] }` or a non-list value. */
  others?: Readonly<Record<string, unknown>>
  types?: readonly string[]
}

const symbolRows = (names: readonly string[] = []) =>
  names.map((name, index) => ({ col: 1, line: index + 1, name, pos: index }))

/** One row shaped like knip's json reporter output when `--exports` is on. */
export const knipRow = ({ exports, file, others, types }: SyntheticIssue) => ({
  file,
  owners: [],
  duplicates: [],
  enumMembers: [],
  exports: symbolRows(exports),
  namespaceMembers: [],
  nsExports: [],
  nsTypes: [],
  types: symbolRows(types),
  ...others,
})

/** Serialized knip json reporter output for the given issues. */
export const knipJson = (...issues: readonly SyntheticIssue[]) =>
  `${JSON.stringify({ issues: issues.map(knipRow) })}\n`
