# Before pushing

- Review the complete diff and saved requirements. Use independent review for cross-cutting,
  security-sensitive, or uncertain behavior; a mechanical edit does not need a separate reviewer.
  Resolve blocking correctness, security, and scope findings before pushing.
- For a discovered semantic defect, inspect sibling sites in the changed surface and verify the
  same defect is not repeated. For client/API changes, use the relevant [impact recipe](impact-recipes.md).
- Follow the [commit checklist](../../../docs/checklists/commit.md): type-aware lint for changed
  TypeScript, directly changed tests, scope inspection, and formatting. CI owns full area suites;
  run broader local checks when the change or a failure requires them.
- Changes to manifests also follow [package metadata](../package-json-checklist/SKILL.md).
  Changes to guards follow [static analysis](../static-analysis-checklist/SKILL.md).
- Verify claimed commands, paths, external references, and CI behavior against their actual owners.
  Close issues only when the change meets their remaining acceptance criteria.
- Before final validation, inspect scope against current `origin/main` and rebase unstacked work
  with `./dev/rebase-onto-main`; use `./dev/rebase-onto-main --stack` or `gh stack sync` for native
  stacks. Re-derive stack topology and rerun affected checks after semantic conflict resolution.
  The helper's protected-checkout refusal is intentional; see [Git and PRs](git-and-prs.md).
- If upstream changes package manifests or the lockfile, run `pnpm install` before later pnpm
  commands. See [dependency policy](../../../docs/development/dependency-updates.md).
- Treat CI failures as potentially related until evidence says otherwise. Use
  [review-ci-logs](../review-ci-logs/SKILL.md) and the
  [transient-retry catalog](../../../ci/transient-retry/README.md) before retrying.
  Voucha's patch-coverage gate blocks; informational Codecov upload status does not replace it.
