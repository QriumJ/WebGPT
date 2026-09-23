# Dispatch and collection efficiency: 2026-09-23

Implemented batched mode preparation/submission and integrated wait/collection, then exercised the skill through actual Codex CLI `gpt-5.6-sol`, reasoning `low`. The final live run completed the small development task and passed all seven independent acceptance cases. Relative to the previous successful small-task delegation, completed controller tool operations decreased from 20 to 15 and total input tokens decreased 33.2%. Uncached input increased 70.6%, however, and an earlier unsuccessful pilot incurred additional cost. This is evidence of fewer controller round trips, not proof of Codex quota savings or uniformly reliable unattended operation.

## Changes

- `dispatch()` settles late mode controls, reuses an already selected mode, or changes recognized visible controls, verifies the selected mode, and submits once inside the existing submission lock. It uses documented CUA methods only. Unknown UI and ownership changes return for explicit handling. Unselected choices in an open menu cannot serve as selected-mode evidence.
- Attempted task tabs are marked for handoff when supported. This protects an unfinished task tab from the documented turn-end auto-close behavior. A failed mark retains the submission receipt and reports `retention: unconfirmed`; it does not resend.
- `client.mjs finish <ids>` quietly waits, uses the returned completion receipt to read/hash-check the saved result, acknowledges once, and returns result text and collection metadata. It avoids a separate status request and preserves partial/failed results, cleanup errors, backup deadlines and recovery signals. Existing `collect` output remains compatible.
- Skill instructions route the normal path through `dispatch` and `finish`. Assignments now include a short requirement to save the final outcome through the Worker; detailed protocol/schema remain on the server. User workflow preferences and concurrent Codex work retain precedence.

No connection-discovery cache was added in this iteration. The final run still located the prepared browser connection. Setup/settings UI and startup permission handling remain separate from the deterministic helpers.

## Validation

All 74 Node tests passed. Skill format validation and `git diff --check` passed. Added cases cover late mode rendering, observed slider changes, unknown UI, ineffective transitions, target changes, active responses, menu/message spoofing, unselected target choices, handoff failure without resend, hash mismatch without acknowledgment, collection revocation, signal preservation and actual CLI `finish` behavior.

An independent read-only review found the open-menu selected-mode ambiguity during development; it was fixed and regression-tested before the final live run. The final CLI workspace contains a frozen snapshot matching the final production helper and client. Session `turn_context` records verify the required model and effort; hashes and counters are in the companion metrics.

Both the previous baseline and final candidate used the same `unique-by-id` seed and acceptance criteria: retain 0/empty-string IDs, omit only null/undefined, preserve the first occurrence, order and input, change only the source/test files, run the existing test command. Neither controller implemented the delegated fix. The controller's benchmark evidence file is separate measurement overhead.

| Measurement | Previous successful delegation | Final successful delegation |
| --- | ---: | ---: |
| WebGPT own tests | 3 passed | 3 passed |
| Independent acceptance | 7/7 | 7/7 |
| Total CLI input tokens | 799,887 | 534,142 |
| Cached input tokens | 754,944 | 457,472 |
| Uncached input tokens | 44,943 | 76,670 |
| Output tokens | 3,823 | 3,175 |
| Browser calls | 11 | 8 |
| Shell calls | 8 | 6 |
| Evidence-file operations | 1 | 1 |
| Total completed tool operations | 20 | 15 |
| Additional parent recovery instructions | 0 | 0 |

The final dispatch handled mode preparation/submission in one browser call. It returned `submission_unconfirmed`; the controller verified the existing message without resending. A conversation-scoped permission prompt required additional browser calls. `finish` returned the saved result; the controller reviewed the relevant files/diff and deleted the owned chat/tab. The final run used an explicit two-minute backup-check interval rather than the baseline's default twenty minutes; this is an evaluation setting, not a new default timeout. Browser/cache/permission conditions were not held constant, so percentages describe these samples, not a causal estimate for every run.

## Unsuccessful pilot and setup costs

Before the final run, an earlier candidate dispatched successfully but never produced a saved development result. After several minutes the parent interrupted/resumed its controller for one requested diagnostic inspection. The runtime had closed the original ephemeral tab at controller interruption; the replacement tab inspection did not establish actual ongoing work. Both assigned files remained identical to the seed. The parent cancelled only that test task; the CLI preserved the failure record and deleted its chat. Raw cause of the original lack of implementation remains unknown. The interruption also confounds any later observation of the original run.

That pilot consumed 2,120,024 cumulative CLI input tokens (2,061,824 cached; 58,200 uncached), 5,422 output tokens, plus parent diagnostic/cancellation work excluded from the child counters. It is not included as a successful efficiency sample and must not be discarded when assessing total development/validation cost. The parent made three read-only CUA calls during diagnosis and could not take over the tab owned by the running CLI; no bypass was attempted.

Setup used its own CLI session to create a test-only connector and verify a trivial terminal print. It observed stdout `WEBGPT_SMALL_READY`, exit status 0, but WebGPT initially ended without a saved completion callback. The setup controller recovered once in the same chat, asking only to save the already-observed result without rerunning the command. It then collected and deleted the smoke chat. This motivated the short completion requirement. The earlier setup snapshot also returned `needs_mode` during late UI hydration and needed UI fallback; the final helper's bounded settling was extended before the final benchmark.

Setup, smoke recovery, pilot failure and teardown are reported separately in the metrics. Parent coding, evaluation, report-writing, browser diagnosis and native review-subagent costs are not represented by child CLI counters. Token counters are not measured Codex usage-limit debits. The final run is still substantially more expensive than the earlier direct Codex solution for this one-line fix.

## Remaining work

The normal path now has fewer model round trips, but broad quota-saving claims remain unsupported. Submission recognition still needs a fallback in this real UI, startup permissions remain costly, connection discovery is not cached, and completion behavior remains model-dependent. Future changes should address those observed costs and be measured on repeated bounded workloads, including failures and cache state. Do not replace user-specified WebGPT workflows or infer a universal task-size threshold from this example.

## Cleanup and full child-CLI cost

All three worker tasks are settled and collected (smoke completed, pilot cancelled, final completed). Owned task chats were deleted, owned tabs closed, the exact test connector removed and verified absent. Only the identified test worker and tunnel were stopped; both exited 0 and their ports had no remaining listeners. Unrelated resources and default configuration were preserved.

The setup session including teardown consumed 4,552,363 cumulative input tokens (4,462,336 cached; 90,027 uncached) and 11,483 output tokens. Adding the unsuccessful pilot and successful final run gives 7,206,529 child-CLI input tokens and 20,080 output tokens for this iteration, excluding parent/subagent work. These are implementation-validation costs, not recurring task costs and not savings. The final snapshot hashes match the current skill, workspace reference, browser helper and client exactly.
