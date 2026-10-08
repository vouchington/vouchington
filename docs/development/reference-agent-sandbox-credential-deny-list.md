# Sandbox credential deny list

[Back to Agent Sandbox](agent-sandbox.md#sandbox-credential-deny-list)

The runtime credential deny list, its rationale inventory, and the checks that keep it consistent
belong to
[vouchington-machines](https://github.com/vouchington/vouchington-machines/blob/main/docs/agent-config.md).
`./configure-agents.sh` writes it into each agent's user config. This checkout no longer carries a
copy, so no checked-in file can drift from it.

This checkout retains its [Blackboard client credential contract](agent-blackboard.md) and the
credentials named in [system-dependencies.md](system-dependencies.md). Before removing a name from
the machine list, check that page, or an equivalent one for the supported local environments, to
confirm the credential is obsolete. A missing reference in this repository is not that evidence: a
developer shell can export a credential this checkout never reads.
