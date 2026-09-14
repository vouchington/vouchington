Review the Docker images. Pick exactly one concrete, bounded improvement that is safe to ship in one PR, only after completing the applicable preflight evidence below: target/stage ancestry and Hadolint/static evidence for any image change.

- Check [Deployment](../../../docs/overview/infrastructure/deployment.md); the build target is AWS ECS Fargate ARM64. (Deployment cost figures moved to the private `vouchington/vouchington-docs` repo.)
- When `backend/Dockerfile` is affected or for any backend image change, run `docker buildx build --call=targets --file backend/Dockerfile .` to enumerate available build targets.
- When `web/Dockerfile` is affected, run `docker buildx build --call=targets --file web/Dockerfile .` to enumerate available build targets.
- Trace relevant `FROM`/`COPY --from` ancestry explicitly, recording the `FROM` chain and `COPY --from` edges; target enumeration alone does not establish the stage graph.
- For any backend image change, run `docker buildx bake --file backend/docker-bake.hcl --print api worker-cpu worker-io`.
- Review existing Hadolint/static evidence before image builds. Treat [`.hadolint.yaml`](../../../.hadolint.yaml) and pinned pre-build CI checks as the source of truth; do not add tooling.
- Look for safe image-size reductions, layer/cache improvements, or runtime startup improvements.
- Keep production behavior unchanged unless the selected improvement explicitly targets runtime behavior.
- After every selected improvement, run the applicable post-change static Dockerfile validation (Hadolint via pinned CI / `.hadolint.yaml`).
- When `backend/docker-bake.hcl` changes, rerun `docker buildx bake --file backend/docker-bake.hcl --print api worker-cpu worker-io` after the change.
- When runtime behavior needs validation, also run a relevant Docker build or smoke test; static evidence does not replace runtime validation.
- When timing, cache-hit, OOM, or savings verification can happen only after merge, keep that work in
  a dedicated open issue; the implementation PR must not auto-close the remaining verification.
