# Parser and Library Swap Checklist

Use this checklist before replacing a parser, tokenizer, serializer, decoder, or format library.
The goal is to lock in compatibility quirks before changing implementation internals.

## Before Swapping

- Identify the current contract: input type, output shape, sync vs. async behavior, error handling,
  fallback values, ordering, byte/character offset behavior, and any malformed input that is accepted.
- Write characterization tests against the current implementation before changing it.
- Prefer an existing parser or platform API over custom parsing. For static-analysis rules, choose in
  this order: off-the-shelf tool config, AST-grep YAML, `no-mistakes`, then repo-local code only when
  the higher tiers cannot express the invariant.
- For security-relevant command parsing, prefer a maintained tokenizer/parser over hand-rolled
  positional token walks. If custom shell handling remains, characterize quoting, heredocs,
  command substitutions, redirections, global options, option values, and nested invocations before
  the first push.
- If a dependency is needed, follow the [package.json Checklist](package-json.md): use `pnpm`, add the
  latest stable version, commit the lockfile, and run the configured package checks.

## Characterization Fixtures

Cover every category that applies:

- Malformed but accepted input: incomplete tables, missing delimiters, duplicate fields, unknown
  tokens, and inputs that should return safe sentinels instead of throwing.
- Legacy encoding and entity behavior: BOM handling, charset precedence, mixed-case HTML entities,
  quoted-printable/base64 MIME bodies, and fallback decoders.
- Language-specific quoting: SQL single quotes, escape strings, dollar quotes, nested comments,
  JavaScript/TypeScript string literals, shell quotes, heredocs, and Markdown inline code.
- Parser AST variants: SQL casts and table-level constraints; shell global options, quoted words,
  heredocs, command substitutions, and redirection targets; YAML/JSON scalar and array forms.
- Scalar coercion: YAML 1.1 style values, TOML/JSON number/string differences, booleans, nulls, and
  time-like strings such as `12:30:45`.
- Offsets and ordering: UTF-8 byte offsets vs. JavaScript string indexes, line numbers, duplicate
  row order, stable sort order, and first-match vs. last-match semantics.
- Fallback paths: parser rejection, unsupported formats, empty input, nullish input, and no-match
  behavior.

## After Swapping

- Keep the public helper signature unchanged unless the accepted plan explicitly allows a breaking
  change.
- Add regression tests for any behavior the new library does differently and intentionally normalize.
- Remove the replaced parser/tokenizer code and any tests that only validate deleted internals.
- Update nearby docs with the new source of truth and any custom fallback that remains.
- Run the focused tests for the touched area plus formatting, typecheck, Syncpack, and no-mistakes checks
  when manifests changed.

## Current Parser Inventory

Prefer replacing or avoiding custom code in this order:

- Markdown parsing in static-analysis docs guards: use `vouchington-tooling/markdown` directly for
  GFM AST operations and `parseMarkdownTables`; do not add local processors, walkers, or table parsers.
- TypeScript literal extraction in static-analysis guards: use TypeScript AST APIs.
- SES inbound MIME body extraction: use a MIME parser library such as `postal-mime`, preserving the
  existing route contract.
- SQL static-analysis scanners: keep `@libpg-query/parser` as primary, consolidate duplicated
  literal/comment fallbacks, and only keep custom fallback behavior for parser-rejected PL/pgSQL
  fragments after characterization.
- HTML raw-byte decoding: delegate to `@jongleberry/vurst-html` 0.3 or newer `decodeHtml`
  (BOM > Content-Type > first-1024-byte meta prescan > UTF-8 > Windows-1252); do not reintroduce
  local charset sniffing.
- Shell command tokenization in Codex hooks: characterize policy behavior first, then evaluate a
  shell tokenizer package for word parsing while keeping heredoc handling explicit if needed.
