# Self-Hosted Runner Port Safety

[Back to Workflow Runners](RUNNERS.md#self-hosted-runner-port-safety)

All CI workflows run on **self-hosted runners** where multiple concurrent jobs share the same host. Follow these rules to avoid port collisions.

`ci/runner-port-policy.json` reserves `2200–2999` in repository code, split into 16-port slices
for runner slots `1–50`. Numeric `actions-runner/<slot>` and `actions-runners/<slot>` paths use
their matching slice. Nonnumeric paths use Fetch-safe `bind(0)` allocation and exclude this range
and Fetch-forbidden ports. Repository-owned Node test listeners bind through
`listenOnRunnerUnreservedEphemeralPort()`, which immediately releases and retries any ephemeral
candidate in the reserved range; Fetch consumers add the shared Fetch-safe predicate. Direct
`listen(0)` calls outside that policy owner are rejected by static analysis. This reservation
separates repository-owned listeners, allocators, and local worktrees. Linux runner provisioning is
pending deployment of the change that merges `2200–2999` into `net.ipv4.ip_local_reserved_ports`;
that host-side contract is owned by [vouchington-machines PR #5](https://github.com/vouchington/vouchington-machines/pull/5).
Until it is deployed, an empty `ip_local_reserved_ports` report is expected; verify that setting on
an idle Linux host before treating the reservation as active.
The allocator skips occupied candidates while selecting. Long-window Playwright jobs keep the
selected sockets bound until each consumer is about to listen. Short-window callers still
print-and-exit; a late bind conflict there fails and the narrow workflow retry runs once.

1. **Docker service ports are safe** — GitHub Actions' `ports:` mapping (e.g., `- 5432`) auto-assigns random host ports. Access them via `job.services.<name>.ports['<container_port>']`.

2. **`docker run -p` host ports must be dynamically allocated** — never hardcode a literal host port in `-p <hostport>:<containerport>` (e.g. `-p 5432:5432`, `-p 127.0.0.1:5432:5432`). Applies to all containers started with `docker run`, including databases. Enforced by `docker-port-policy.test.mts`.

   **Preferred** — let Docker pick the host port atomically (no TOCTOU race):

   ```bash
   docker run -d --name my-container -p "127.0.0.1::5432" my-image
   PORT=$(docker port my-container 5432 | cut -d: -f2)
   echo "PORT=$PORT" >> "$GITHUB_ENV"
   ```

   **Alternative** — when the port must be known before the container starts, use Python to find a free port then pass it as a variable (see rule 3 below).

3. **App server ports must use the shared allocator** — never hardcode ports like `3000`.
   Numeric runners select the lowest available port in their deterministic slice; other paths use
   the dynamic fallback:

   ```yaml
   - name: Allocate port
     run: |
       PORT=$(python3 ci/allocate-browser-safe-ports.py 1)
       if [ -z "$PORT" ]; then echo "::error::Failed to allocate port"; exit 1; fi
       echo "PORT=$PORT" >> $GITHUB_ENV
   ```

   Browser-facing ports must also exclude Chromium-restricted ports such as `4045`, otherwise
   Playwright can fail with `net::ERR_UNSAFE_PORT` before the app receives the request.

4. **Allocate multiple ports atomically** — the shared allocator holds all selected sockets while
   selecting the complete set before it reports any port numbers, reducing TOCTOU races:

   ```yaml
   - name: Allocate ports
     run: |
       PORTS=$(python3 ci/allocate-browser-safe-ports.py 4)
       read PORT NEXT_PORT IMAGE_LAMBDA_PORT WORKER_PORT <<< "$PORTS"
       if [ -z "$PORT" ] || [ -z "$NEXT_PORT" ] || [ -z "$IMAGE_LAMBDA_PORT" ] || [ -z "$WORKER_PORT" ]; then echo "::error::Failed to allocate ports"; exit 1; fi
       echo "PORT=$PORT" >> $GITHUB_ENV
       echo "NEXT_PORT=$NEXT_PORT" >> $GITHUB_ENV
       echo "IMAGE_LAMBDA_PORT=$IMAGE_LAMBDA_PORT" >> $GITHUB_ENV
       echo "WORKER_PORT=$WORKER_PORT" >> $GITHUB_ENV
   ```

5. **Order matters** — any step that references `$PORT` (or similar) must come _after_ the allocation step. When a container needs an allocated port before setup or build, start it immediately after allocation so Docker binds the selected port before later work can widen the race window. The Playwright OTel collector follows this pattern conditionally with its explicit HTTP and gRPC ports.

   A cancelled shard can leave that collector running. Before a later OTel-enabled shard allocates its deterministic slice, it reaps containers labeled both `com.voucha.ci.component=playwright-otel` and its exact `com.voucha.ci.workspace=$GITHUB_WORKSPACE`, then applies the same labels to its replacement. During the pre-label migration, it can also reap an unlabeled container only when one fresh `docker inspect` proves all of: an exact numeric `/voucha-otel-<run>-<attempt>-<shard>` name, the pinned `otel/opentelemetry-collector-contrib:0.153.0` image, and this workspace's exact read-only `dev/otel/collector-config-ci.yaml` bind mount at `/etc/otelcol-contrib/config.yaml`. The runner registration executes one job at a time with a unique workspace, so the exact workspace is the serialization boundary: a matching collector is a prior orphan, not a live peer. Deletion always uses the literal, untruncated inspected ID. Never use name-only cleanup or a Docker prune, because another workspace can share the host.

6. <a id="hold-until-bind"></a>**Hold long-window ports until bind; fail short-window late conflicts** — Playwright and
   credentialed Playwright allocate with `--hold` so the selected sockets stay reserved across
   setup and build. `--hold-dir` is resolved before daemonizing and before `--release`,
   `--stop`, and `--check`, so `.` names the same directory on every command. `--stop` tears
   down only the holder recorded in that directory; it does not reap a replacement holder that
   reused the workspace identity with a different hold directory. On Linux, fallback
   IPv4 hold rejects a candidate unless `0.0.0.0` can be reserved. Darwin cannot bind
   that wildcard after loopback with `SO_REUSEADDR=0`, so it keeps the loopback
   reservation. `--release` returns only once the port is bindable on
   `127.0.0.1` (`SO_REUSEADDR=0`). `--stop` skips that wait when it did not SIGTERM a live
   holder, when a replacement holder already owns the workspace slice, or when another live
   allocator process still owns the port (it reports pid and cmdline on stderr and leaves that
   owner in place). A live `--stop` wait that still times out names the occupant, TIME_WAIT,
   or no owner rather than a bare bindable error. See [`ci/README.md`](../../ci/README.md).
   Release each port immediately
   before its `listen()` or `docker run -p`.
   Short-window callers (smoke, `allocate-ports`, image builds) still print-and-exit; let the
   app server or Docker report a late bind failure and keep the narrow one-attempt workflow
   retry. A repeated failure must be investigated.

   The Playwright (including the credentialed suite), image-smoke, image-lambda smoke,
   backend smoke, and Cloudflare Worker smoke workflows capture a one-day
   `browser-port-diagnostics-*` artifact after failure. It records the allocated ports, matching
   listeners and Docker publications, the Linux reserved/ephemeral-port settings, and bounded
   runner identity. The collector is best-effort and non-masking: it never changes the original
   step result, dumps no process environment, and does not reallocate or retry ports. Use it to
   distinguish a late local listener from a missing host reservation before changing allocator
   policy.

   For `lambdas/dev-server.mts`'s port specifically, every caller of its `listenWithRetry`
   additionally captures at _bind time_: Playwright and the credentialed suite reach it through
   the shared `webServer` config, and `static-lambdas`'s image-lambda smoke test
   (`smoke-test-image-lambda.sh`) invokes it directly — the first non-Playwright bind-time
   producer. In every case `listenWithRetry` invokes the same collector inline on the first
   `EADDRINUSE` and again on the final give-up attempt. This exists because the post-hoc,
   failure-only capture above runs after the process holding the port has already been torn down
   (Playwright's `webServer` process group; the smoke script's own `stop_lambda`), so whatever held
   the port is already gone by then. Bind-time evidence lands in `bind-time-attempt-<n>/`
   subdirectories of the same artifact directory, so it uploads through the existing
   failure-gated step with no separate reporting path. The image-lambda smoke script additionally
   wraps that in its own `smoke-attempt-<n>/` level, one per script-side port-reallocation retry
   (`MAX_PORT_BIND_ATTEMPTS`), giving bind-time evidence the full path
   `smoke-attempt-<n>/bind-time-attempt-<m>/` — never compounded, since each script attempt
   recomputes the nested directory from the same base rather than appending to the prior one.
   The first-attempt capture writes to disk even if a later retry
   recovers and the job ultimately passes; in that case the job never reaches the `failure()` gate,
   so that evidence is never uploaded and is discarded with the runner's temp directory. This is a
   deliberate trade-off, not a bug: a recovered collision produced no failure to diagnose, and
   widening the upload gate to `always()` would affect the five other workflows that share this
   composite action.
