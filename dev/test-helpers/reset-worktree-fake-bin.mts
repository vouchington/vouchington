import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { registerTestDir } from './reset-worktree-fixtures.mts'

export async function makeFakeBin({
  gitDirty = false,
  gitFetchFails = false,
  gitUntracked = '',
}: {
  gitDirty?: boolean
  gitFetchFails?: boolean
  gitUntracked?: string
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-reset-worktree-bin-'))
  registerTestDir(dir)
  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
if [ "$1" = "-C" ]; then
  _repo_path="$2"
  shift 2
fi
case "$*" in
  "rev-parse --show-toplevel")
    printf '%s' "\${_repo_path:-$(pwd)}"
    ;;
  "diff-index --quiet HEAD --")
    printf 'git diff-index --quiet HEAD --\\n' >> "$log"
    exit ${gitDirty ? 1 : 0}
    ;;
  "status --porcelain --untracked-files=normal")
    printf 'git status --porcelain\\n' >> "$log"
    printf '%b' ${JSON.stringify(gitUntracked)}
    ;;
  "fetch origin main")
    printf 'git fetch origin main\\n' >> "$log"
    exit ${gitFetchFails ? 1 : 0}
    ;;
  "branch --show-current")
    printf 'worktree-test\\n'
    ;;
  "worktree list --porcelain")
    printf 'worktree %s\\nbranch refs/heads/main\\n' "\${_repo_path:-/fake/main}"
    ;;
  "checkout -B "*)
    printf 'git %s\\n' "$*" >> "$log"
    ;;
  "reset --hard origin/main")
    printf 'git reset --hard origin/main\\n' >> "$log"
    ;;
  "clean -fd")
    printf 'git clean -fd\\n' >> "$log"
    ;;
  *)
    printf 'unexpected git invocation: %s\\n' "$*" >&2
    exit 1
    ;;
esac
`,
  )
  await chmod(join(dir, 'git'), 0o755)
  await writeFile(
    join(dir, 'openssl'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'openssl %s\\n' "$*" >> "$log"
if [ "$1" = rand ]; then printf 'cafef00d\\n'; else cat >/dev/null; printf 'deadbeefcafe%052d\\n' 0; fi
`,
  )
  await chmod(join(dir, 'openssl'), 0o755)
  await writeFile(
    join(dir, 'docker'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'docker %s\\n' "$*" >> "$log"
case "$1" in
  ps)
    case "$*" in
      *"-a"*) printf '%s\\n' "\${FAKE_DOCKER_PS_A:-}" ;;
      *) printf '%s\\n' "\${FAKE_DOCKER_PS:-}" ;;
    esac
    ;;
esac
`,
  )
  await chmod(join(dir, 'docker'), 0o755)
  await writeFile(
    join(dir, 'tmux'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'tmux %s\\n' "$*" >> "$log"
case "$1" in
  has-session) exit "\${FAKE_TMUX_HAS_SESSION_EXIT:-1}" ;;
  display-message)
    case "$*" in
      *"window_id"*) printf '@0\\n' ;;
      *) printf '%s\\n' "\${FAKE_TMUX_CURRENT:-}" ;;
    esac
    ;;
esac
`,
  )
  await chmod(join(dir, 'tmux'), 0o755)
  await writeFile(join(dir, 'lsof'), '#!/usr/bin/env bash\n: # no-op\n')
  await chmod(join(dir, 'lsof'), 0o755)
  await writeFile(join(dir, 'ps'), '#!/usr/bin/env bash\n: # no-op\n')
  await chmod(join(dir, 'ps'), 0o755)
  await writeFile(join(dir, 'sleep'), '#!/usr/bin/env bash\n: # no-op sleep\n')
  await chmod(join(dir, 'sleep'), 0o755)
  for (const cmd of ['dropdb', 'createdb', 'pnpm']) {
    await writeFile(
      join(dir, cmd),
      `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf '${cmd} %s\\n' "$*" >> "$log"
`,
    )
    await chmod(join(dir, cmd), 0o755)
  }
  return dir
}
