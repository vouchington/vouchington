# Inline-workflow shell footguns (actionlint + shellcheck)

[Back to CI Tooling](README.md)

Several issues that have caused CI failures in inline `run:` blocks:

**SC2215 — `#` comment after `\` continuation truncates the command**

```yaml
run: |
  aws ecs run-task \
    --cluster my-cluster \ # this comment silently drops everything after it
    --launch-type FARGATE
```

Shellcheck flags this as a literal `#` comment after a line continuation. The `\` on the `--cluster`
line is NOT a continuation — it is consumed as the escape for `#`, and the command terminates after
`my-cluster`. The `--launch-type` line is a separate, orphaned word. Fix: remove the comment or
move it to a dedicated `# comment` line before the construct.

**`docker exec` inherits `NODE_OPTIONS` from the runner environment**

If the runner sets `NODE_OPTIONS=--experimental-vm-modules` (or similar), `docker exec` passes the
host environment into the container. Node inside the container may reject flags it doesn't recognize
and exit 1 with a confusing "bad option" message. Fix: unset in the step `env:` block or explicitly
pass only the flags you need via `env NODE_OPTIONS= docker exec ...`.

**pnpm symlink `isDirectory()` vs `isSymbolicLink()` in inline shell**

When `node_modules/.bin/<tool>` is a pnpm symlink, `[ -d node_modules/.bin/foo ]` is false because
`stat` follows symlinks but the directory is the target, not the link. Use
`[ -x node_modules/.bin/foo ]` (executable-file test) instead of directory checks against
symlinked binaries.

**SC2016 — backtick chars in single-quoted JMESPath queries**

AWS CLI `--query` arguments use backtick (`` ` ``) as JMESPath literal delimiters (e.g.
``join(`,`, subnets)``). Inside a single-quoted shell string, these backticks are literal
characters — but shellcheck warns SC2016 ("Expressions don't expand in single quotes") because it
sees what looks like command-substitution delimiters. Fix: add `# shellcheck disable=SC2016` on the
line immediately before the command that uses the single-quoted JMESPath query.

**SC1083 — literal `{` in `HEAD^{commit}` triggers brace-expansion warning**

```bash
git rev-parse --verify HEAD^{commit}  # shellcheck flags {commit}
```

Shellcheck interprets the `{commit}` as a failed brace expansion. Fix: quote the git revision
specifier in single quotes: `'HEAD^{commit}'`. The argument to git is still the literal string
`HEAD^{commit}` — git processes the `^{type}` disambiguation suffix, not the shell.

**SC2295 — unquoted variable in parameter-expansion suffix pattern**

```bash
ver="${ver%-${os}-${arch}.${tarext}}"  # SC2295 ×3
```

Shellcheck warns that unquoted variable references inside a `${var%pattern}` pattern may be
glob-expanded unexpectedly. Fix: pre-assign the suffix to a named variable and double-quote it in
the pattern — `_sfx="${os}-${arch}.${tarext}"; ver="${ver%-"${_sfx}"}"`.

**YAML plain-scalar `run:` values: `# N` is a YAML comment**

In YAML, `#` preceded by a space in a plain (unquoted) scalar is a YAML comment, not a shell
comment:

```yaml
run: echo "Pending — see #5496"   # YAML parses #5496" as a comment; shell receives unclosed "
```

Fix: wrap the `run:` value in YAML single quotes: `run: 'echo "Pending — see #5496"'`. Actionlint
extracts shell from the YAML-parsed value, so the shell script shellcheck receives will have an
unclosed double-quote and produce SC1072/SC1073 parse errors.
