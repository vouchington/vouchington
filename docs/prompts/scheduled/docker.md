Review the Docker images. Pick at most one concrete, bounded improvement that is safe to ship in one PR, only after the preflight below.

- Check [Deployment](../../overview/infrastructure/deployment.md); the target is AWS ECS Fargate ARM64.
- Preflight: enumerate targets with `docker buildx build --call=targets --file <backend|web>/Dockerfile .`, trace the `FROM`/`COPY --from` graph explicitly, and for backend images run `docker buildx bake --file backend/docker-bake.hcl --print api worker-cpu worker-io` (again after changing the bake file). Treat [`.hadolint.yaml`](../../../.hadolint.yaml) and the pinned pre-build CI checks as the static-evidence source of truth; do not add tooling.
- Look for safe image-size, layer/cache, or startup improvements without changing production behavior. Static evidence does not replace a Docker build or smoke test when runtime behavior needs validation.
- Verification that only post-merge data can provide (timing, cache hits, OOM, savings) goes in a dedicated open issue; the PR must not auto-close it.
