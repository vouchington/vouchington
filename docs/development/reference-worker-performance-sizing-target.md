# Sizing target

[Back to Worker Performance](worker-performance.md#sizing-target)

- **`api`**: target less than 1 vCPU steady-state and 512 MB task memory.
- **`worker-cpu` image**: target 0.5 vCPU (512 CPU units) and 1024 MB task memory.
- **`worker-io` image**: target 0.25 vCPU (256 CPU units) and 512 MB task memory.
- The private `vouchington-infra` repository owns which worker services are live, their desired
  counts, and their task sizing.
- Local development runs one **`worker-cpu`** process for all policy-managed queues (`dev/tmux` defaults to `--max-old-space-size=3072` / `UV_THREADPOOL_SIZE=8`, unconstrained by ECS task limits).
- Acceptance envelope on a quiet local queue: threads ≤ 60, RSS ≤ 3 GB, CPU ≤ 150% steady-state.
- Scale-out is preferred over scale-up. If a queue is hot, use the [worker environment
  knobs](reference-worker-performance-concurrency-model.md#worker-env-knobs) instead of raising
  single-process limits.
