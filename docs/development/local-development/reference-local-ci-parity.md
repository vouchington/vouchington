# Local CI Parity

[Back to Dev Environment Reference](README.md#local-ci-parity)

Use `./dev/ci-local` to print and run CI-equivalent commands from this worktree:

```bash
./dev/ci-local --list
./dev/ci-local web-integration --dry-run
./dev/ci-local backend-smoke
```

The runner checks that registered commands still appear in their source workflow files. The
`web-integration` target sources local `.env` for setup, then unsets `CF_WORKER_SECRET` for the
Vitest step so local runs match CI's backend-origin secret behavior while retaining local DB and
Valkey URLs.
