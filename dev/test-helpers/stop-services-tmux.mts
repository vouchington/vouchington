import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function makeStopServicesTmuxFakeBin(testDirs: string[]) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-stop-services-bin-'))
  testDirs.push(dir)

  await writeFile(
    join(dir, 'tmux'),
    `#!/usr/bin/env bash
  log="\${FAKE_COMMAND_LOG:?}"
  printf 'tmux %s\\n' "$*" >> "$log"
  case "$1" in
    has-session) exit "\${FAKE_TMUX_HAS_SESSION_EXIT:-1}" ;;
    display-message)
      case "\${!#}" in
        '#S') printf '%s\n' "\${FAKE_TMUX_PANE_SESSION:-}" ;;
        '#{pane_pid}')
          if [ "\${FAKE_TMUX_PANE_PID:-}" = self ]; then
            command -p ps -p "$PPID" -o ppid= | tr -d '[:space:]'
          else
            printf '%s\n' "\${FAKE_TMUX_PANE_PID:-}"
          fi
          ;;
      esac
      ;;
  esac
  `,
  )
  await chmod(join(dir, 'tmux'), 0o755)

  await writeFile(
    join(dir, 'docker'),
    `#!/usr/bin/env bash
  log="\${FAKE_COMMAND_LOG:?}"
  printf 'docker %s\\n' "$*" >> "$log"
  if [ "$1" = "ps" ]; then
    printf '%s\\n' "\${FAKE_DOCKER_PS:-}"
  fi
  `,
  )
  await chmod(join(dir, 'docker'), 0o755)

  await writeFile(
    join(dir, 'lsof'),
    `#!/usr/bin/env bash
  case "$*" in
    "-a -p "*" -d cwd -Fn")
      pid="$3"
      cwd_var="FAKE_LSOF_CWD_\${pid}"
      cwd="\${!cwd_var:-\${FAKE_LSOF_CWD:-}}"
      if [ -n "$cwd" ]; then
        printf 'p%s\\nn%s\\n' "$pid" "$cwd"
      fi
      ;;
    *":3900"*) printf '%s\\n' "\${FAKE_LSOF_3900:-}" ;;
  esac
  `,
  )
  await chmod(join(dir, 'lsof'), 0o755)

  await writeFile(
    join(dir, 'ps'),
    `#!/usr/bin/env bash
  if [ "$*" = "-eo pid=,command=" ]; then
    printf '%b' "\${FAKE_PS_OUTPUT:-}"
  elif [ "\${FAKE_PS_FAIL:-}" = 1 ]; then
    exit 1
  elif [ -n "\${FAKE_PS_PARENT:-}" ]; then
    printf '%s\n' "$FAKE_PS_PARENT"
  else
    command -p ps "$@"
  fi
  `,
  )
  await chmod(join(dir, 'ps'), 0o755)

  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
  if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then
    printf '%s' "$2"
    exit 0
  fi
  printf 'unexpected git invocation: %s\\n' "$*" >&2
  exit 1
  `,
  )
  await chmod(join(dir, 'git'), 0o755)

  await writeFile(
    join(dir, 'dropdb'),
    `#!/usr/bin/env bash
  printf 'dropdb %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
  `,
  )
  await chmod(join(dir, 'dropdb'), 0o755)

  await writeFile(
    join(dir, 'createdb'),
    `#!/usr/bin/env bash
  printf 'createdb %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
  `,
  )
  await chmod(join(dir, 'createdb'), 0o755)

  await writeFile(
    join(dir, 'pnpm'),
    `#!/usr/bin/env bash
  printf 'pnpm %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
  `,
  )
  await chmod(join(dir, 'pnpm'), 0o755)

  return dir
}
