# Individual Services

[Back to Dev Environment Reference](README.md#individual-services)

After `source .env`, each service can be started individually:

| Service                    | Command                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend (server + workers) | `node --watch backend/dev.mts`                                                                                                                                                                                           |
| Backend server only        | `node --watch backend/entrypoints/api/serve.mts`                                                                                                                                                                         |
| Backend workers (IO)       | `QUEUES=$(node backend/modules/worker-queue-inventory/worker-queue-policy-cli.mts dev-io-queues) node --watch backend/entrypoints/worker-io/serve.mts`                                                                   |
| Backend workers (CPU)      | `QUEUES=$(node backend/modules/worker-queue-inventory/worker-queue-policy-cli.mts dev-cpu-queues) node --watch backend/entrypoints/worker-cpu/serve.mts`                                                                 |
| Next.js                    | `cd web && pnpm run dev`                                                                                                                                                                                                 |
| Lambdas (image + crawl)    | `node --watch lambdas/dev-server.mts`                                                                                                                                                                                    |
| CF Worker (HTTP fallback)  | `(cd cloudflare-worker && node scripts/wrangler/dev.mts --local --port $WORKER_PORT --ip 127.0.0.1)`                                                                                                                     |
| CF Worker (HTTPS)          | `(cd cloudflare-worker && node scripts/wrangler/dev.mts --local --port $WORKER_PORT --ip 127.0.0.1 --local-protocol https --https-cert-path ../dev/certs/localhost.pem --https-key-path ../dev/certs/localhost-key.pem)` |

`./dev/tmux` uses separate [`backend/entrypoints/api/serve.mts`](../backend/entrypoints/api/serve.mts), [`backend/entrypoints/worker-io/serve.mts`](../backend/entrypoints/worker-io/serve.mts), and [`backend/entrypoints/worker-cpu/serve.mts`](../backend/entrypoints/worker-cpu/serve.mts) processes. Queue placement is generated from [`backend/modules/worker-queue-inventory/worker-queue-policy.json`](../backend/modules/worker-queue-inventory/worker-queue-policy.json); set `WORKER_CPU_EXTRA_QUEUES` to move IO-capable queues to CPU locally.
