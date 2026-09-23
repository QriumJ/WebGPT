# Persistent Chat reuse and bounded-module validation — 2026-09-23

The final fresh Codex CLI session reused the saved connection without opening Plugins, verified **Chat**, dispatched once, handled a late conversation-scoped permission card through the recovery helper, and collected `NOTE_REUSE_OK` with exit code 0 and verified integrity. The helper's native permission-menu transition was exercised live successfully. Both implementations of the bounded module passed the same 13 independent acceptance cases. End-to-end quota savings and fully unattended cleanup are **not established**: both final controllers stopped to request deletion confirmation, and required an exact-task cleanup follow-up.

## Implemented changes

- `client.mjs resume <id>` acknowledges one actually checked task once, then quietly waits and collects. A failed acknowledgment is not retried; completion racing the check is collected without rescheduling. Other task IDs remain untouched.
- `recoverPermission()` handles late permission cards without resending. It verifies the owned conversation, exact connector, and unique latest assignment. The observed native menu-only AX transition is accepted only after fresh prompt evidence, on the same owned URL, with the exact menu and a strict structural allowlist. A visible newer assignment, unrelated controls, wrong URL, or Work surface stops mutation.
- When no permission card is observed, recovery returns a bounded current-reply observation from the same screen read. This lets the controller inspect help/failure/completion evidence without another automatic browser read. Unknown and truncated evidence remain explicit.
- Every conversation must use **Chat, never Work**, including delegation, browser-only tasks, setup smoke tests and `open`. Helpers reject observed `surface=work` and the actual selected Work radio. If Work appears after a send, the result remains an ambiguous existing submission with handoff retained; it is not a fresh-send retry.
- Normal tasks select the existing exact connector in Chat or use its verified Chat launch URL. Names alone do not prove selection. A private `setup.json` beside the config records registration identity and launch information for a new session, without task tokens or bearer connection URLs. Connector/worker/tunnel survive task cleanup.
- Setup now distinguishes creating/discovering an app from completing its first-use Add/Connect dialog. The contradictory instruction to omit the short save-result requirement was removed. Helper imports are scoped to the current browser runtime and renewed after reset/resume.

## Actual CLI validation

All measured controllers used **`gpt-5.6-sol` with reasoning `low`**, confirmed from session `turn_context` records. Assignments, coordination and evidence were English. Browser UI language was preserved. The new mandatory Chat-only requirement arrived during the first reuse attempt; that controller was interrupted, its access cancelled, and both owned attempts deleted. No Work task was continued after the requirement.

1. **Persistent setup:** created the current URL-backed registration and verified all five Worker tools. An older same-name registration was preserved. Discovery alone was insufficient: the first fresh session reported unavailable tools. The subsequent Chat attempt completed first-use Connect for the exact new registration, printed `REUSE_OK`, and saved/collected the result. This entire failed/interrupted/repair sequence is retained in costs.
2. **Bounded module:** two pure range-set functions and one test file, without CLI/dependencies/docs or broad project work. The fixture and 13-case evaluator were frozen before either implementation. Direct Codex initially passed 12/13 and required a sparse-array validation correction; it then passed 13/13 and 11 own tests. WebGPT's version passed 13/13 and 9 tests. Its saved test evidence lacked a final exit status, so the controller ran the missing verification once. No controller implementation takeover occurred.
3. **Permission transition:** the module controller exposed a real menu-only AX failure. The old helper opened the exact menu but could not re-observe the hidden thread; the controller selected the scoped option manually. The helper was then corrected against that observed structure. The final fresh-session smoke returned `permission: conversation_selected` directly from `recoverPermission`, without that fallback.
4. **Fresh reuse without supplied identity:** the final smoke prompt did not supply connector/browser identity or a launch URL. The controller read the saved default setup note, used a new Chat, and completed the terminal task. It did not enter Plugins or reinstall/restart the connection. The setup note path is part of the skill's normal context-recovery guidance.
5. **Cleanup:** both module and final smoke controllers inferred a just-in-time confirmation requirement from browser policy documentation and stopped, despite the task's explicit cleanup authorization. Neither reported an actual tool rejection before stopping. Exact-owned-chat follow-ups completed cleanup. The module resume also made one undefined-helper call before importing/reacquiring its runtime. These costs are included, not labelled automatic success.

The measured module snapshot predates the final menu-only/reply-observation fix. The final smoke exercises those helper changes; it is not a second module-cost comparison. Final documentation also clarifies importing helpers after a runtime reset. No claim is made that the final module cost would equal the earlier measured run.

## Cost comparison

Counters are cumulative across `exec resume`, so only each thread's latest total is counted. Tool counts include only completed command, browser-tool and file-change operations. Both direct repair and delegated cleanup follow-ups are included. Controller-written evidence files are measurement overhead. Cached input counts do not translate directly into usage-limit consumption.

| Bounded module, including recovery/cleanup | Direct Codex | WebGPT delegation |
| --- | ---: | ---: |
| Independent acceptance | 13/13 | 13/13 |
| Total input tokens | 174,966 | 1,329,867 |
| Cached input tokens | 134,144 | 1,240,192 |
| Uncached input tokens | 40,822 | 89,675 |
| Output tokens | 4,148 | 5,259 |
| Completed tool operations | 11 | 24 |
| Additional controller follow-ups | 1 implementation repair | 1 cleanup instruction |

For this sample, delegation used about **7.6× total input, 2.2× uncached input, and 1.27× output**. The task remained too small to demonstrate a quota-saving benefit under the observed UI/recovery overhead. Correct implementation alone is not proof of the project's quota objective. Do not promise savings or automatically enlarge assignments into long-running work to amortize this cost; user-requested delegation/concurrency still takes precedence.

One-time setup used 3,201,090 input / 5,099 output tokens. The interrupted reuse/Chat repair thread used 4,133,614 input / 9,132 output tokens. These are excluded from the recurring module row but included in the accompanying full metrics. The final fresh-reuse smoke, including its cleanup follow-up, used 687,085 input / 4,111 output tokens and 16 completed tool operations; its pre-wait browser path used two calls. Across all five CLI threads, totals were **9,526,622 input / 27,749 output tokens**. Parent implementation/inspection, native review agents, fixture/evaluator creation and local service work are additional and excluded from CLI counters.

## Validation and retained resources

The local suite passed **110 tests**; the final structural tightening also passed its targeted cases. Skill validation, relative-reference resolution and `git diff --check` passed. Tests cover acknowledgment races/failures/isolation, current-assignment ownership, native-menu boundaries, reply extraction/truncation, Work rejection, ambiguous-send retention and cleanup transitions. Independent review found no remaining concrete issue in the final permission changes.

The connector remains installed and connected. The owned launchd services `com.local.webgpt.worker` and `com.local.webgpt.tunnel` remain running, with default config at `~/.config/webgpt/config.json` and reusable metadata at `~/.config/webgpt/setup.json`. Final checks confirmed unchanged service PIDs, successful public health, and all four test tasks terminal/collected with no remaining backup deadline. All sent test conversations were deleted and their owned tabs closed. Task access is revoked after collection/cancellation; unrelated registrations and resources are preserved.

**Remaining limits:** cleanup confirmation behavior is still controller/runtime-dependent, so fully unattended cleanup is not reliable. Quick Tunnel URLs change on tunnel restart: launchd persistence keeps the current process alive across Codex sessions, but does not provide a permanent public origin or automatic reconnection after restart. No paid account, fixed domain or replacement of unrelated infrastructure was introduced.

## Subsequent evidence correction

The final-skill module was subsequently retested; see [the retest report](2026-09-23-final-module-retest.md). A targeted reread also confirmed that the earlier deletion stops followed an explicit tool-document action-time confirmation rule. They were not actual tool rejections, but describing them merely as an inferred requirement understates that documentation basis. The retest completed deletion without a stop, so unattended cleanup remains variable.
