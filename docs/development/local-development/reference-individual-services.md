# Individual Services

[Back to Dev Environment Reference](README.md#individual-services)

After `source .env`, each service can be started individually:

| Service                    | Command                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend (server + workers) | `node --watch backend/dev.mts`                                                                                                                                                                                           |
| Backend server only        | `node --watch backend/entrypoints/api/serve.mts`                                                                                                                                                                         |
| Backend workers            | `WORKER_QUEUE_CLASS=all node --watch backend/entrypoints/worker-cpu/serve.mts`                                                                                                                                           |
| Next.js                    | `cd web && pnpm run dev`                                                                                                                                                                                                 |
| Lambdas (image + crawl)    | `node --watch lambdas/dev-server.mts`                                                                                                                                                                                    |
| CF Worker (HTTP fallback)  | `(cd cloudflare-worker && node scripts/wrangler/dev.mts --local --port $WORKER_PORT --ip 127.0.0.1)`                                                                                                                     |
| CF Worker (HTTPS)          | `(cd cloudflare-worker && node scripts/wrangler/dev.mts --local --port $WORKER_PORT --ip 127.0.0.1 --local-protocol https --https-cert-path ../dev/certs/localhost.pem --https-key-path ../dev/certs/localhost-key.pem)` |

`./dev/tmux` uses the API entrypoint and a single [`backend/entrypoints/worker-cpu/serve.mts`](../../../backend/entrypoints/worker-cpu/serve.mts) process. `WORKER_QUEUE_CLASS=all` makes the worker expand to every queue in [`backend/modules/worker-queue-inventory/worker-queue-policy.json`](../../../backend/modules/worker-queue-inventory/worker-queue-policy.json), including the explicit-inclusion queues and SQS consumers; see [Worker Process Defaults](reference-worker-process-defaults.md).
