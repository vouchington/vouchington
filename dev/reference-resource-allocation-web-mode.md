# Resource Allocation (backend/web modes)

[Back to Dev Environment Reference](README.md#resource-allocation-web-mode)

| Resource          | Main worktree            | Other worktrees               |
| ----------------- | ------------------------ | ----------------------------- |
| CF Worker port    | 8787 (fixed)             | Random available port         |
| Backend port      | Random (saved in `.env`) | Random available port         |
| NextJS port       | Random (saved in `.env`) | Random available port         |
| Image Lambda port | Random (saved in `.env`) | Random available port         |
| Inspector port    | Random (saved in `.env`) | Random available port         |
| Valkey port       | Random (saved in `.env`) | Random available port         |
| Valkey container  | `voucha-valkey`          | `voucha-valkey-<worktree-id>` |
| PostgreSQL        | `voucha`                 | `voucha-<worktree-id>`        |

For every non-main checkout, `<worktree-id>` is `d` plus the first 12 lowercase hexadecimal
characters of SHA-256 over the canonical physical worktree root. Linked worktrees and disposable
full clones use the same identity rule, so equal directory names under different roots cannot share
host-level resources. The protected main checkout remains the explicit shared-resource exception.

Ports are stored in `.env` and `.valkey-port` after backend or web initialization —
`./dev/initialize backend` allocates the same full port set (including the CF Worker and Next.js
ports it doesn't start) so a later `./dev/initialize web` reuses them without reassigning. Re-running
`./dev/initialize backend` or `./dev/initialize web` is safe — it reuses saved ports, Valkey container
name, database name, and (web only) VAPID keys for the current worktree identity unless missing or
invalid.

Local allocation and saved-port reuse exclude the reserved range in
[`worktree-port-policy.json`](worktree-port-policy.json); every non-Worker service also excludes
the main Cloudflare Worker’s fixed port `8787`.
