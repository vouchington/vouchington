export type ContentCommandFlagSet = {
  longValueFlags: ReadonlyMap<string, boolean>
  shortValueFlags: ReadonlyMap<string, boolean>
  longBooleanFlags: ReadonlySet<string>
  shortBooleanFlags: ReadonlySet<string>
}

export const PR_CREATE_FLAGS = commandFlagSet(
  [
    ['--assignee', '-a'],
    ['--attach'],
    ['--base', '-B'],
    ['--body', '-b'],
    ['--body-file', '-F'],
    ['--head', '-H'],
    ['--label', '-l'],
    ['--milestone', '-m'],
    ['--project', '-p'],
    ['--recover'],
    ['--repo', '-R', true],
    ['--reviewer', '-r'],
    ['--template', '-T'],
    ['--title', '-t'],
  ],
  [
    ['--draft', '-d'],
    ['--dry-run'],
    ['--editor', '-e'],
    ['--fill', '-f'],
    ['--fill-first'],
    ['--fill-verbose'],
    ['--help', '-h'],
    ['--no-maintainer-edit'],
    ['--web', '-w'],
  ],
)

export const ISSUE_CREATE_FLAGS = commandFlagSet(
  [
    ['--assignee', '-a'],
    ['--attach'],
    ['--blocked-by'],
    ['--blocking'],
    ['--body', '-b'],
    ['--body-file', '-F'],
    ['--label', '-l'],
    ['--milestone', '-m'],
    ['--parent'],
    ['--project', '-p'],
    ['--recover'],
    ['--repo', '-R', true],
    ['--template', '-T'],
    ['--title', '-t'],
    ['--type'],
  ],
  [
    ['--editor', '-e'],
    ['--help', '-h'],
    ['--web', '-w'],
  ],
)

export const PR_EDIT_FLAGS = commandFlagSet(
  [
    ['--add-assignee'],
    ['--add-label'],
    ['--add-project'],
    ['--add-reviewer'],
    ['--attach'],
    ['--base', '-B'],
    ['--body', '-b'],
    ['--body-file', '-F'],
    ['--milestone', '-m'],
    ['--repo', '-R', true],
    ['--remove-assignee'],
    ['--remove-label'],
    ['--remove-project'],
    ['--remove-reviewer'],
    ['--title', '-t'],
  ],
  [['--help', '-h'], ['--remove-milestone']],
)

function commandFlagSet(
  valueFlags: readonly (readonly [string, string?, boolean?])[],
  booleanFlags: readonly (readonly [string, string?])[],
): ContentCommandFlagSet {
  const longValueFlags = new Map<string, boolean>()
  const shortValueFlags = new Map<string, boolean>()
  const longBooleanFlags = new Set<string>()
  const shortBooleanFlags = new Set<string>()
  for (const [long, short, isRepository = false] of valueFlags) {
    longValueFlags.set(long, isRepository)
    if (short !== undefined) shortValueFlags.set(short.slice(1), isRepository)
  }
  for (const [long, short] of booleanFlags) {
    longBooleanFlags.add(long)
    if (short !== undefined) shortBooleanFlags.add(short.slice(1))
  }
  return { longValueFlags, shortValueFlags, longBooleanFlags, shortBooleanFlags }
}
