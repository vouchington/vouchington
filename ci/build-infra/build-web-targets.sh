#!/usr/bin/env bash
set -eo pipefail

if [ -f .env ]; then set -a; source .env; set +a; fi
export NEXT_TEST_BUILD=0
export NEXT_PUBLIC_ASSET_PREFIX=''
# A healthy cold build takes about 90 seconds; 300s is over three times that. Callers' step
# ceilings cover the restore and verify deadlines above, this deadline, run-bounded's kill
# grace, and a minute for the timing upload below.
# run-bounded kills the build process group; timeout-minutes on this composite step did
# not (merge-group run 37572766026).
python3 "$GITHUB_WORKSPACE/node_modules/vouchington-tooling/scripts/run-bounded.py" 300 node ci/setup-web-integration.mts
