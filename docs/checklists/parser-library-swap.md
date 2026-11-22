# Parser and Library Swap Checklist

Generic guidance (characterization tests before replacing a library) lives in the `test-authoring` skill (replacing a library). This page keeps the Voucha parser inventory.

## Current Parser Inventory

Prefer replacing or avoiding custom code in this order:

- Markdown parsing in static-analysis docs guards: use `vouchington-tooling/markdown` directly for
  GFM AST operations and `parseMarkdownTables`; do not add local processors, walkers, or table parsers.
- TypeScript literal extraction in static-analysis guards: consume `no-mistakes` module facts or
  `vouchington-tooling` extraction APIs; do not add local TypeScript AST parsers or walkers.
- SES inbound MIME body extraction: use a MIME parser library such as `postal-mime`, preserving the
  existing route contract.
- SQL static-analysis and replay guards: consume typed PostgreSQL facts from `no-mistakes` or
  `vouchington-tooling`. Unsupported executable SQL must retain the characterized failure behavior;
  parser recovery and AST projection belong upstream, rather than in local literal/comment fallbacks.
- HTML raw-byte decoding: delegate to `@jongleberry/vurst-html` `decodeHtml`
  (BOM > Content-Type > bounded meta prescan > UTF-8 > Windows-1252); do not reintroduce
  local charset sniffing.
- Shell command tokenization in Codex hooks: characterize policy behavior first, then evaluate a
  shell tokenizer package for word parsing while keeping heredoc handling explicit if needed.
