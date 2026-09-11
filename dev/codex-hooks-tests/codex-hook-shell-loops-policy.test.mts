import { describe, expect, it } from 'vitest'
import { findPreToolUseBlock } from '../codex-hooks/policy.mts'

describe('findPreToolUseBlock shell loop policy', () => {
  it.each([
    'until false; do echo x; done',
    'until output=$(npx pr-shepherd) && echo "$output"; do sleep 90; done',
    'while true; do sleep 1; done',
    'while [ "$x" -lt 10 ]; do echo $x; done',
    'until curl -sf http://localhost:3000/health; do sleep 5; done',
    'for f in *.ts; do echo $f; done',
    'for f in *.ts; do rg TODO "$f"; done',
    'for i in 1 2 3; do echo $i; done',
    'select x in a b c; do echo $x; done',
    '{ while true; do sleep 1; done; }',
    "bash <<'EOF'\nfor f in *.ts; do echo $f; done\nEOF",
    'sh <<-EOF\n\twhile true; do sleep 1; done\nEOF',
    "cat <<'EOF' | bash\nfor f in *.ts; do echo $f; done\nEOF",
    'bash -c "until false; do echo x; done"',
    "bash -c 'while true; do sleep 1; done'",
    "bash -c 'select x in a b; do echo $x; done'",
    "sh <<'EOF'\nwhile true; do echo x; done\nEOF",
  ])('allows otherwise-legal shell loop: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  it.each(['git status', 'echo "while you wait"', 'npx pr-shepherd 123'])(
    'allows non-loop command: %s',
    command => {
      expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
    },
  )
})
