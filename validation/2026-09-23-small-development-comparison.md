# Small development delegation: 2026-09-23

A fresh paired test completed successfully on both paths. WebGPT fixed the small bug, ran tests, submitted its result, and its Codex controller collected and deleted the task chat without a parent recovery instruction. This establishes a working bounded development path. It does **not** establish Codex usage savings: the delegated controller consumed more recorded tokens and tool operations than direct Codex for this tiny task.

## Scope and controls

Both actual Codex CLI runs used `gpt-5.6-sol` with reasoning effort `low`, verified in their session `turn_context` records. Each received an identical seed project. The direct run implemented locally; the delegated run used the current WebGPT skill snapshot, signed-in Extra High ChatGPT, and the worker terminal. No native subagents implemented either solution.

The complete assignment was to fix `uniqueById` so `0` and the empty string are valid IDs, only null/undefined IDs are omitted, and first occurrence, input order and non-mutation are preserved. Only one source file and one existing test file could change. No CLI, dependencies, documentation or new features were requested. The seed and assignment are in `fixtures/unique-by-id`; acceptance checks are in `evaluate-unique-by-id.mjs`.

A separate setup CLI created a test-only connector and completed a trivial terminal smoke test before development. It verified stdout `WEBGPT_SMALL_READY`, exit code 0, saved result integrity, collection, and chat deletion. It handled an observed conversation-scoped permission grant. That setup cost is excluded from the development comparison and reported separately in the metrics.

## Results

| Measurement | Direct Codex | Codex delegating to WebGPT |
| --- | ---: | ---: |
| Development result | PASS | PASS |
| Own tests | 2 passed | 3 passed |
| Independent acceptance cases | 7/7 | 7/7 |
| CLI input tokens | 101,248 | 799,887 |
| Cached input tokens | 89,088 | 754,944 |
| Uncached input tokens | 12,160 | 44,943 |
| Output tokens | 1,447 | 3,823 |
| Completed tool operations | 5 | 20 |
| Extra parent recovery instructions | 0 | 0 |

The unchanged seed fails five of the seven acceptance cases, confirming that the evaluator detects the target defect. Both delivered versions pass all seven. WebGPT changed only the assigned implementation/test files; the controller separately wrote the requested benchmark evidence file. Saved result integrity was verified and the task chat was deleted and its tab closed.

The delegated controller performed 11 browser calls, including discovering/opening the chat, setting and verifying Extra High mode, submission, startup permission observation and cleanup. It also performed 8 shell calls and 1 evidence-file operation. These are substantial fixed costs relative to a one-line implementation fix. They are not evidence of repeated supervision during a long development task.

All controller prompts, assignments and saved result reporting were in English. The existing ChatGPT UI language was preserved. UI-generated tool labels are not evidence that the underlying coordination language changed.

## Interpretation

The previous large assignment was a poor first development validation because it combined many requirements with an unproven terminal permission path. This smaller test validates that permission readiness, editing, testing, result collection and task-chat cleanup can complete. It does not isolate assignment size as the cause of the previous failure: setup and permission state also differed, and the previous raw terminal rejection reason remains unknown.

For this tiny task, the delegated controller used about 7.9 times the input tokens, 3.7 times the uncached input tokens and 2.6 times the output tokens of direct Codex, excluding setup. Recorded tokens are not measured quota debits; no conversion to Codex usage-limit percentages is established.

Do not turn this successful tiny smoke-like development case into a default recommendation to delegate every one-line fix. User-requested WebGPT usage remains first priority. Under an efficiency-oriented default, the useful next target is a bounded task substantial enough to amortize dispatch/collection costs while remaining short enough for one WebGPT run. This test establishes neither that threshold nor a universal task duration or file-count limit. No new skill instructions were added based solely on this one sample.

Private raw CLI logs, saved worker results and both delivered projects are retained in the temporary evidence root listed in the metrics. They may contain credentials and are not copied into this report. Child CLI counters exclude parent preparation, independent evaluation and report-writing costs. Setup and teardown counters are separate; resume counters are cumulative and must not be added as independent runs.

## Setup and final cleanup

Setup plus the terminal smoke consumed 1,675,136 input tokens (1,616,256 cached; 58,880 uncached) and 7,792 output tokens. Including the later connector teardown, that same CLI session's cumulative counters were 3,780,661 input tokens (3,680,896 cached; 99,765 uncached) and 11,951 output tokens. These cumulative counters are not added to the setup counters again. Teardown involved autonomous browser-tab recovery before successful removal; this does not establish that every setup/settings transition is frictionless.

Both task chats were deleted, owned tabs closed, the exact test connector removed and its absence verified. The parent stopped only the identified test-owned worker and tunnel; both processes exited successfully and neither test port retained a listener. No default worker configuration or unrelated connector was changed. Fixture/evaluator/report changes passed `git diff --check`; production skill code was not changed in this test.
