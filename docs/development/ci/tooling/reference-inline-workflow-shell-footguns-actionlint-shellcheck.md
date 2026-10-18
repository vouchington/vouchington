# Inline-workflow shell footguns

[Back to CI Documentation](../README.md)

Actionlint runs shellcheck over inline `run:` blocks and names most problems itself. These cases
fail confusingly or only in CI, so the cause is worth knowing.

- **A `#` comment after a `\` continuation ends the command.** The `\` escapes the `#` instead of
  continuing the line, so the remaining flags become a separate, orphaned command. Put the comment
  on its own line before the construct.
- **`docker exec` inherits the runner's `NODE_OPTIONS`.** Node in the container can reject a flag
  it does not know and exit 1 with a bare "bad option" message. Clear it for that command
  (`env NODE_OPTIONS= docker exec ...`) or in the step `env:` block.
- **A plain-scalar `run:` value treats ` #` as a YAML comment.** YAML drops the rest of the line
  before the shell sees it, so shellcheck reports an unrelated unclosed-quote parse error. Quote
  the whole value or use a block scalar.
