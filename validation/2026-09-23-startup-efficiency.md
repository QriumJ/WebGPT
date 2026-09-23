# Startup batching and instruction compaction: 2026-09-23

The worker-delegation preparation path decreased from seven model/browser calls before waiting to two in both live trials. Normal-path instructions decreased from 16,147 to 9,555 characters (40.8%). Both actual Codex CLI trials completed the same small development task and passed all seven independent acceptance cases. Total workflow cost did not uniformly decrease: the first trial needed deletion fallback, and the final trial encountered a permission prompt after the startup window. The final run used the same 15 tool operations as the previous baseline, 4.2% more total input tokens, 48.3% fewer uncached input tokens and 13.4% fewer output tokens. These are observed token counts, not measured Codex quota savings.

## Changes

`dispatch()` now optionally includes a bounded startup pass. It uses the already-dispatched prompt and receipt to confirm a late user turn without resending. For the exact named connector, explicit `authorizeConversation: true` permits choosing only the observed conversation-scoped option. Connector mismatch, unknown/duplicate controls, absent authorization, unconfirmed submission or ownership changes stop mutation. The dispatch lock now covers the complete startup transition, including calls through `sendOnce`.

The helper reports `conversation_selected` only after selecting the exact option and observing the known user turn again on the owned chat. This is not proof of terminal readiness. Empty/error pages produce `unconfirmed`; `not_observed` likewise proves no readiness. Draft-to-saved URL evidence is pinned after each transition. Unconfirmed submissions include compact reason/observation diagnostics without prompt content.

The existing logs did not preserve dispatch's internal snapshots, so the exact cause of the previous `submission_unconfirmed` result could not be established. The next visible user text matched all 653 characters of that assignment. No speculative parser relaxation was made; the new startup pass reuses the existing ownership and user-turn checks.

Normal instructions were compacted and exceptional recovery detail moved to `references/recovery.md`. The total including that optional reference is 12,881 characters (20.2% below the former normal-path pair). User workflow/language preferences, concurrent Codex work, quiet waiting, partial results, integrity limits, cleanup ownership and runtime gates remain. The verified Chrome identity supplied by setup is reused directly rather than rediscovered.

The first new live trial exposed delayed deletion-dialog rendering. `deleteAndClose` was then given bounded read-only settling for the matching dialog and post-delete redirect. Neither confirmation nor deletion is repeated. Wrong titles and unrelated navigation still stop the helper. The final live run completed deletion and tab closure in one helper call.

## Validation and comparison

All live controllers used `gpt-5.6-sol`, reasoning `low`, verified from session `turn_context` records. Both tasks used the same seed, assignment and two-minute evaluation backup interval as the preceding final comparison. Each WebGPT edited only the source/test files, ran its passing tests (two in the first trial, three in the final trial), saved the result, and its controller collected it and cleaned up its task chat. Neither needed a parent recovery instruction. The controller evidence file is measurement overhead, separate from the delegated implementation.

All 85 Node tests passed, including adversarial startup authorization/ownership/concurrency cases and delayed deletion transitions. Skill validation, relative reference checks and `git diff --check` passed. The final frozen skill/helper/client snapshot matches the current files. Both delivered versions independently passed 7/7 cases.

| Measurement | Previous final baseline | First new trial | Final new trial |
| --- | ---: | ---: | ---: |
| Independent acceptance | 7/7 | 7/7 | 7/7 |
| Pre-wait browser calls | 7 | 2 | 2 |
| Total browser calls | 8 | 8 | 5 |
| Shell calls | 6 | 8 | 9 |
| Evidence-file operations | 1 | 1 | 1 |
| Total tool operations | 15 | 17 | 15 |
| Total input tokens | 534,142 | 679,948 | 556,616 |
| Cached input tokens | 457,472 | 648,960 | 516,992 |
| Uncached input tokens | 76,670 | 30,988 | 39,624 |
| Output tokens | 3,175 | 3,789 | 2,748 |
| Additional parent recovery instructions | 0 | 0 | 0 |

Both live dispatch calls returned `submitted` and `permission: not_observed`. Therefore the newly automated conversation-choice mutation was validated by the targeted tests and grounded prior UI evidence, but was not exercised by these two live dispatches. Do not label it a live-tested grant path.

In the final trial a permission prompt appeared after the bounded startup window. At the due check, the CLI used the narrower **Allow once** button; its tool-call title described this as conversation-scoped, but the actual AX index/action proves a single-use choice. The operation was authorized, and no persistent grant was made. The CLI also called `finish` again before acknowledging `backupDue`, then read the recovery instructions, acknowledged and resumed. Those avoidable shell round trips are included in the totals. The first trial's deletion fallback is likewise retained, not discarded.

The results establish reduced preparation round trips and less normally loaded instruction text. Cache state, UI rendering, permission timing and generation duration were not controlled. Known Chrome identity was explicitly supplied from setup in these new trials. Changes cannot be assigned a universal token or quota reduction percentage from these samples. The tiny task remains more expensive to delegate than the previously measured direct Codex fix.

## Setup, total validation cost and cleanup

Setup created a test-only URL connector and verified all five tool schemas. It did not repeat a separate terminal smoke: actual authorized terminal execution was validated by the development trials. Setup/teardown is excluded from recurring-workload rows above.

Setup plus teardown consumed 2,826,267 cumulative input tokens (2,751,616 cached; 74,651 uncached) and 6,912 output tokens. Across setup/teardown and both development trials, child CLI totals were 4,062,831 input tokens and 13,449 output tokens. Parent implementation, review subagents, service preparation, independent evaluation and reporting are additional and excluded. Resume counters are cumulative and were not double-counted.

Both tasks are completed and collected; both owned task chats were deleted and their tabs closed. The exact test connector was removed and its absence verified. Only the identified owned worker and tunnel were stopped; both exited 0 and their ports have no remaining listeners. Unrelated resources and default configuration were preserved. Private raw logs, task results and delivered projects remain in the temporary evidence root listed in the metrics; credentials and unrelated browser contents are not reproduced here.
