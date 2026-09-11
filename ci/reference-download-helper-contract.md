# Download helper contract

[Back to CI Tooling](README.md#download-helper-contract)

`ci_download_to <url> <destination> [extra-curl-flags…]` guarantees the following, each
verified by its named test in [`ci/download-with-diagnostics.test.mts`](download-with-diagnostics.test.mts):

| Guarantee                                                                                                                                              | Covering test                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Argument validation** — rejects fewer than two positional args before curl runs                                                                      | `rejects missing arguments before invoking curl`                                 |
| **Caller shell state** — preserves the caller's `set -e`/`set +e`; failures return 1 and do not kill a `set +e` caller                                 | `preserves a caller with errexit disabled`                                       |
| **Timeout defaults** — injects `--connect-timeout 30 --max-time 120` so callers that omit timeouts are still bounded                                   | `passes default --connect-timeout and --max-time to curl when caller omits them` |
| **Caller override ordering** — places caller flags after the defaults so curl's last-occurrence-wins semantics let callers tighten or relax the bounds | `lets callers override the default --max-time via a trailing flag`               |
| **Destination cleanup** — removes a partial destination file on any non-2xx or transport failure                                                       | `prints and summarizes non-2xx HTTP responses` (cleanup also verified here)      |
| **Summary-write failure tolerance** — a failure to write `$GITHUB_STEP_SUMMARY` never masks the download-failure exit code or stdout message           | `tolerates a summary-write failure without masking the download error`           |
