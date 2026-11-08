#!/usr/bin/env bash
if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  git fetch --no-tags --depth=1 origin "$BASE_SHA"
fi
node static-code-analysis/run-node-checks.mts --checks config-inventory-policy,repo-file-policy,scc-complexity,targeted-guardrails
