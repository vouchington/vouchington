# Fix Main dependency policy

[Back to Auto Harness automation](reference-harness-automation.md)
[Back to Workflow Reference](README.md)

Fix Main classifies dependency-rooted failures before general related-work handling. It audits the
repository-owned candidates and live evidence for the same package, ecosystem, and failure scope. A
focused same-dependency PR stops new-PR dispatch and is handled by the existing-PR review flow; a
broader or unrelated PR is evidence only. A related issue is referenced rather than duplicated.

The agent must distinguish a dependency version, resolution, artifact, or pin failure from a
repository-owned CI defect. Catalogued transients remain owned by triage. New transient classifiers
require real-log fixtures and durable-failure counterfixtures; deterministic and repository-owned
failures require root-cause fixes.

The trusted-host agent revalidates the exact source run and target head immediately before it
commits, pushes with an exact lease, and creates one draft pull request. It cannot mutate related
work, merge, or arm auto-merge. See [Auto Harness automation](reference-harness-automation.md).
