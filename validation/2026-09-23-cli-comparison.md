# WebGPT cleanup and instruction-cost validation

This is a historical measurement of the candidate at that stage. Subsequent browser transition changes and their separate validation are recorded in [browser-transitions](2026-09-23-browser-transitions.md).

## Scope and method

This experiment evaluates task-owned chat cleanup and orchestration overhead. It does not measure the Codex quota meter or establish savings for arbitrary coding tasks.

- Real signed-in ChatGPT, Extra High UI mode, controlled through the actual Codex CLI.
- CLI 0.155.1; `gpt-5.6-sol`, reasoning `low`, verified in session `turn_context` records.
- Baseline: repository HEAD skill. Candidate: revised skill and helpers.
- Fresh CLI sessions for each primary run, identical prompts within each pair, isolated workspace skill copies, same CLI flags. Sequential run order: baseline single, candidate single, candidate follow-up, baseline follow-up.
- Single workload: request one exact plain-chat reply, then delete that test conversation and close its owned tab.
- Follow-up workload: request two exact replies in the same conversation, then the same cleanup.
- Prompts explicitly require browser-only operation and authorize exact test cleanup. No worker connection is required by these workloads.
- Raw events and private AX snapshots are kept outside the repository. This report omits conversation URLs, connection credentials and unrelated browser state.

## Changes under test

The default workflow now prioritizes the user's division of work and supports explicit same-chat follow-ups. Browser-only requests skip worker registration and worker result collection. Internal coordination stays in English; user-facing responses follow the user's language.

The cleanup helper now verifies the current title and confirmation dialog on the same owned URL, with one read-only retry for a transitional dialog. Previously, it compared against the title captured before opening the menu. A title can settle during this interval. The observed baseline failure had a matching dialog on a later snapshot; the original pre-menu title was not captured, so title settling is a plausible cause, not a proven diagnosis of that particular failure.

Tests cover title settling, transient dialog state, mismatched dialog titles and a changed conversation URL. These changes do not authorize deleting unrelated chats or bypass a real runtime approval gate.

Instructions were compacted and user-controlled `open` details moved to a separate reference. The delegation path no longer loads those details by default.

| Documentation, Unicode characters | Original | Earlier expanded revision | Final candidate |
| --- | ---: | ---: | ---: |
| SKILL.md | 10,175 | 13,361 | 8,009 |
| workspace.md | 6,207 | 7,613 | 6,049 |
| Combined delegation references | 16,382 | 20,974 | 14,058 |

The final combined size is 14.2% below the original and 33.0% below the expanded revision. This is document size, not tokenizer output. Browser-only requests need only SKILL.md; worker-backed delegation also needs workspace.md. Open-mode instructions were moved, not discarded. The expanded revision was not part of the matched A/B comparison, so the experiment does not isolate the effect of shortening alone.

## Interpretation constraints

Each workload has one primary run per variant. UI timing, generated titles, model decisions and prompt-cache state vary. Total input includes cached input; subtracting cached input is useful context, not a quota calculation. Output tokens already include reasoning tokens; do not add reasoning tokens again. Tool counts include completed browser calls, shell commands and file-change operations, not individual clicks within a call.

The initial CUA documentation output is mandatory and large. Its repeated context contributes to input totals. Resumed recovery sessions report cumulative usage in this environment and must not be naively added to initial totals. Recovery is reported separately.

These browser-only workloads validate browser orchestration and explicit user preferences. They do not establish end-to-end cost savings for long worker-backed implementation tasks. Earlier worker integration smoke tests established operation, not a matched quota comparison.

## Primary fresh-session results

| Workload | Variant | Input | Cached input | Uncached input | Output | Tool operations | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| single | baseline | 474,093 | 415,872 | 58,221 | 3,247 | 15 | Reply observed with trailing underscore; cleanup blocked |
| followup | baseline | 94,526 | 62,336 | 32,190 | 790 | 3 | Stopped before sending; requested reconfirmation |
| single | candidate | 255,122 | 205,824 | 49,298 | 1,622 | 8 | Exact reply; helper deleted and closed |
| followup | candidate | 457,078 | 413,824 | 43,254 | 2,587 | 14 | Both exact replies; helper deleted and closed |

The single-task candidate used 46.2% less total input, 15.3% less uncached input, 50.0% less output and 46.7% fewer tool operations than the baseline's initial run. The baseline run had not completed cleanup, so this is a comparison of observed first-attempt costs, not two equally successful executions. The baseline also attempted worker registration despite the explicit browser-only request; the candidate did not.

The follow-up baseline stopped before sending either message, citing CUA's action-time confirmation instructions. Its lower first-attempt token count is not an efficiency win: it produced no requested answer. The candidate completed both messages and cleanup without another parent instruction. It did perform a read-only recovery when the draft conversation URL changed to its saved URL; the follow-up was then submitted without duplication. This transition still has a cost.

In both candidate primary runs the cleanup helper returned `deleted_and_closed`, with no manual cleanup fallback or additional parent instruction. The single candidate initially returned `submission_unconfirmed`; the CLI verified the already-visible prompt and response without resending. These are remaining transition paths, not fully eliminated browser uncertainty.

The baseline single run returned `needs_dialog_verification` and then asked for action-time confirmation. One recovery turn deleted the exact test conversation and verified its deletion notice and home-page redirect. Its cumulative counters were 839,278 input / 730,880 cached / 4,875 output. Session token-count records confirm these include the original run; the recovery delta is 365,185 input / 315,008 cached / 1,628 output. The first reply was recorded with a trailing underscore; the evidence does not establish whether the response was sampled before generation settled or whether the model produced the extra character.

A separate exploratory run of the earlier expanded revision also cleaned up successfully. Thus the old helper's failure is intermittent. Two final-candidate successes do not prove that title handling alone caused the observed improvement, or that future runtime confirmation gates cannot recur.

## Recovery and cleanup findings

The follow-up baseline required two additional parent instructions: one to proceed with the already-requested messages and another to proceed with the already-requested deletion. Its old `sendOnce` helper rejected the second message, so the CLI used freshly observed UI controls for that explicit follow-up. Both exact replies were eventually observed. After the deletion confirmation turn, the original cleanup helper succeeded directly. This again shows intermittent cleanup behavior rather than a deterministic old-helper failure.

Both candidate primary runs completed without additional parent instructions. This is evidence of less rework in these cases, not proof that skill wording can eliminate genuine tool-level approval requirements. Runtime documentation's action-time confirmation language affected baseline decisions; no automatic approval rejection was reported in these runs.

All test-owned conversations were deleted and owned tabs closed, including baseline recovery resources. Unrelated browser resources were preserved. These browser-only comparison runs did not start a worker or tunnel; the baseline single registration attempt failed without a worker connection.

## Local verification and conclusion

- `node --test skills/webgpt/scripts/*.test.mjs`: 49 passed, 0 failed.
- Skill `quick_validate.py`: valid.
- `git diff --check`: clean.
- The final operational instructions, workspace reference and browser helper match the candidate snapshot used by the CLI tests.

The candidate is smaller than both the original and expanded instructions, handles both requested browser workflows, and needed fewer recovery interventions in this sample. The observed single-task counters support lower orchestration cost. They do not establish a universal percentage reduction in Codex Usage Limit. A broader paired sample of representative worker-backed coding tasks would be needed for that claim; the present evidence should not be generalized to long-running development work.

Machine-readable counters and source hashes: [2026-09-23-cli-metrics.json](2026-09-23-cli-metrics.json). Counters cover the tested CLI sessions, excluding the parent agent's experiment setup, code editing and report preparation.

## Session totals through cleanup, including recovery

Use the last cumulative session counter, not the sum of resumed counters. Both follow-up variants eventually produced both exact replies and removed the test chat. The single baseline still had its recorded response mismatch.

| Workload | Variant | Input | Uncached input | Output | Tool operations | Extra parent instructions |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| single | baseline + recovery | 839,278 | 108,398 | 4,875 | 22 | 1 |
| single | candidate | 255,122 | 49,298 | 1,622 | 8 | 0 |
| followup | baseline + recovery | 1,056,793 | 64,025 | 4,539 | 21 | 2 |
| followup | candidate | 457,078 | 43,254 | 2,587 | 14 | 0 |

For the completed follow-up workflow, the candidate used 56.7% less total input, 32.4% less uncached input and 43.0% less output in this sample. These figures include the baseline's observed reconfirmation and recovery overhead; they do not isolate instruction length or estimate quota accounting.
