# CI Job Conditions

[Back to CI Reference](ci.md#ci-job-conditions)

There is no pre-merge CI orchestrator. Pull requests and merge groups start the seven required
checks independently: `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, and
`gitleaks`. Each area workflow calls
[`ci-detect-changes.yml`](../../.github/workflows/ci-detect-changes.yml) and uses its own path
filter to decide whether its area is selected. A pull request is classified from its own layer, and
a merge group applies the same filters to the whole queued range, so a group that touches backend
and web selects both and skip-passes the other areas
([diff scope](#change-detection-diff-scope)). Workflow or local-action edits select every eligible area, and the nightly schedule and
manual dispatch select every area without a diff. A selected area runs its full suite. An
unselected area ends in a passing required gate, making the skipped state explicit to branch
protection.

Area static checks are the only prerequisite for their own suites. They do not serialize unrelated
areas. After selected suites pass, a pull request's area coverage job checks the full LCOV evidence
against rules owned by that area, then its required gate reports the result. A merge group skips the
coverage job because each entry's own lines were already gated at its pull request, and the gate
passes the skipped job. Codecov is informational and does not gate a pull request or merge group.

## Change-detection diff scope

Each consumer reads one intended diff. A pull request is a **layer**: its own files, which on a
native stack exclude the layers below it. A merge group is the **combined queued range**. Because
every layer of a native stack reports the stack base as `github.base_ref`, no consumer may compare
against the base ref; that range would charge an upper layer with every lower layer's files.

- **Layer:** the merge commit's first parent is the base tip for a standalone pull request and the
  lower layer's test merge on a native stack, so `HEAD^1..HEAD` is the layer's own change. The API
  file list has the same layer scope, so docs-only and the path filters agree. A lower layer landing
  or a stack rebase changes the first parent without changing the layer's files. Repeated validation of
  a lower layer's area on an upper layer is not intended on pull requests.
- **Combined queue range:** intentional. A merge group tests the queued entries together, as `main`
  will contain them, so one entry's code makes the group select that area even when a later entry
  is docs-only. Do not narrow it to the last entry. Selecting test areas from each entry's own diff
  was measured and declined: `main` runs no test suites, so the merge group is the last test gate.
- **Queued native stacks:** every enqueued layer runs its own selected suites. Running them only on
  the highest enqueued layer was measured and not built.
  The top layer's run already contains the layers below and is the critical path, so the change
  saves runner time but not merge time. Because the queue only merges non-failing entries, a lower
  layer that skipped its suites would land untested when only the top fails, unless its required
  gates reported the top layer's result.
- **Patch coverage:** layer-scoped for the same reason, and run on pull requests only. See
  area patch coverage in [CI](ci.md#area-workflows).

Trusted Docker validation builds pass `secrets.AWS_TEST_ROLE_ARN` to the `setup-aws` action for
OIDC test and smoke credentials. The PR-assumable test role has no ECR authentication or image-push
permissions, so validation builds load their images locally and never publish runtime artifacts.

Main reuses each published image whose attestation verifies and builds only missing targets. A main
run that touches no runtime-image input stops after detection: the area workflows already validated
that revision in the merge queue, and Nightly reruns every area at the main tip. Main workflows
publish only and do not rerun pull-request or merge-group test suites.
