# CI Job Conditions

[Back to CI Reference](ci.md#ci-job-conditions)

There is no pre-merge CI orchestrator. Pull requests and merge groups start the seven required
checks independently: `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, and
`gitleaks`. Each area workflow calls
[`ci-detect-changes.yml`](../../.github/workflows/ci-detect-changes.yml) and uses its own path
filter to decide whether its area is selected. A merge group applies the same filters to its
base-to-head diff, so a group that touches backend and web selects both and skip-passes the other
areas. Workflow or local-action edits select every eligible area, and the nightly schedule and
manual dispatch select every area without a diff. A selected area runs its full suite. An
unselected area ends in a passing required gate, making the skipped state explicit to branch
protection.

Area static checks are the only prerequisite for their own suites. They do not serialize unrelated
areas. After selected suites pass, the area coverage job checks the full LCOV evidence against rules
owned by that area, then its required gate reports the result. Codecov is informational and does
not gate a pull request or merge group.

Trusted Docker validation builds in
[`publish-backend-images.yml`](../../.github/workflows/publish-backend-images.yml) and
[`publish-web-images.yml`](../../.github/workflows/publish-web-images.yml) pass `secrets.AWS_TEST_ROLE_ARN` to
[`setup-aws`](../../.github/actions/setup-aws/action.yml) for OIDC test and smoke credentials.
The PR-assumable test role has no ECR authentication or image-push permissions; validation builds
load their images locally rather than publishing runtime artifacts.

The same reusable workflows publish the smoke-tested and scanned images from trusted merge-group
runs. Main resolves and verifies those immutable digests first, builds only when an authenticated
manifest lookup proves a target is absent, and publishes only the remaining missing targets. The
shared runtime-image path filters select both merge-group publication and main deployment intent;
test-only and documentation-only main runs keep their validation coverage without requesting an
image fallback or completed-deploy dispatch.

Main workflows retain their own path-scoped triggers and completed-run deployment receiver. They
are not a continuation of pull-request or merge-group CI. See [area test suites](ci.md#area-test-suites)
and [coverage gates](reference-ci-coverage-gates.md) for the detailed contracts.
