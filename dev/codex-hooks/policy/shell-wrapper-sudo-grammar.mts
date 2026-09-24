import type { OptionGrammar } from './shell-option-grammar.mts'

/**
 * sudo(8) getopt string: `Aa:bC:c:D:Eeg:Hh::iKklnPp:R:r:SsT:t:U:u:Vv`. Every short letter with a
 * colon is aliased to its long name so `-u root` and `--user root` (or `--user=root`) resolve to
 * the same option and consume the same next word: before this grammar existed, only the
 * self-contained `--user=root` form worked, and the space-separated long form (`--user root`) or
 * an unmodeled short letter (`-r`, `-t`, `-u`) left its value as an unrecognized word, breaking the
 * wrapper chain there instead of past it. `-h`/`--help` and `-h host`/`--host` share one letter
 * with different meanings (bare vs. attached), matched by sudo's own `h::` (optional, attached
 * only, never the next word) — `--host` is unambiguous, so it is modeled as its own required long
 * option instead.
 */
export const SUDO_GRAMMAR: OptionGrammar = {
  aliases: {
    C: 'close-from',
    D: 'chdir',
    R: 'chroot',
    T: 'command-timeout',
    U: 'other-user',
    a: 'auth-type',
    c: 'login-class',
    g: 'group',
    p: 'prompt',
    r: 'role',
    t: 'type',
    u: 'user',
  },
  long: {
    askpass: 'none',
    'auth-type': 'required',
    background: 'none',
    bell: 'none',
    chdir: 'required',
    chroot: 'required',
    'close-from': 'required',
    'command-timeout': 'required',
    edit: 'none',
    group: 'required',
    help: 'none',
    host: 'required',
    list: 'none',
    'login-class': 'required',
    login: 'none',
    'non-interactive': 'none',
    'other-user': 'required',
    'preserve-env': 'optional',
    'preserve-groups': 'none',
    prompt: 'required',
    'remove-timestamp': 'none',
    'reset-timestamp': 'none',
    role: 'required',
    'set-home': 'none',
    shell: 'none',
    stdin: 'none',
    type: 'required',
    user: 'required',
    validate: 'none',
    version: 'none',
  },
  shortOptionalArgument: 'h',
  shortRequiredArgument: 'aCcDgpRrTtUu',
}
