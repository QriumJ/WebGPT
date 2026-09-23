# Browser transition verification

This follow-up addresses the remaining draft-URL and submission-observation paths documented in [the earlier comparison](2026-09-23-cli-comparison.md).

## Implementation

- A shared resolver accepts a draft-to-saved URL change only when the active `page-header` subtree contains one exact matching draft conversation menu button. Sidebar history links, matching message text, prefixes and ambiguous menu matches are insufficient evidence.
- Follow-up submission and cleanup use the resolver. Cleanup revalidates the target after opening its menu, before selecting Delete.
- Submission observes the UI up to four times, with at most two seconds of intentional delay in total. Browser-call latency is additional. These observations occur inside one helper call; typing and Return still occur once.
- A new submission pins the first observed conversation URL. Later unproven conversation changes cannot establish successful submission.
- An observed stop-generation control (including disabled/stopping state) returns `response_in_progress` before typing. It does not consume the attempt; the same explicit follow-up can proceed after the response finishes.
- A missing or unknown user-turn format remains `submission_unconfirmed`; the attempt is consumed and cannot be resent. This is an intentional stopping condition, not a promise to recognize arbitrary future UI changes.
- SKILL.md briefly explains returned URLs, internal settling and the generation preflight result, increasing it from 8,009 to 8,220 Unicode characters.

The previous live `submission_unconfirmed` run did not capture the helper's internal snapshots. Delayed rendering is a plausible explanation, not an established root cause. Deterministic tests now exercise late-arriving evidence directly.

## Regression coverage

`node --test skills/webgpt/scripts/*.test.mjs`: **55 passed, 0 failed**.

New cases cover active-header draft resolution before and after sending, rejection of sidebar-only/wrong/prefix/ambiguous draft evidence, fourth-observation confirmation, a bounded permanent-uncertainty result, one-send behavior, unproven navigation, and canonicalization after opening the cleanup menu. Existing duplicate-send, mode, user-turn, dialog and target-mismatch checks continue to pass.

## Actual Codex CLI runs

All three primary runs and the cleanup recovery used CLI 0.155.1, `gpt-5.6-sol`, reasoning `low`, isolated skill snapshots and the real signed-in ChatGPT Extra High interface. Internal prompts and evidence were English. No worker connection was requested. Raw events and owned conversation identifiers remain in private temporary evidence directories.

1. **Normal same-chat follow-up:** the same prompt as the earlier comparison. Both sends returned `submitted`; both exact replies were observed; cleanup returned `deleted_and_closed`. No additional parent instruction or submission/cleanup fallback was needed. The CLI itself refreshed the saved URL before the follow-up, so this run does **not** prove automatic draft resolution.
2. **Intermediate targeted draft transition:** pass an actually observed draft URL unchanged to the second send helper after the same conversation has acquired its saved URL. Fabricated draft identifiers and sidebar-only evidence are explicitly disallowed by the test prompt. Record whether this transition was actually exercised.

The normal run used the new draft-resolution and submission-settling logic. A review then identified the cleanup-menu transition gap, and the intermediate targeted run exposed the generation preflight gap. Both additional corrections are included in the final targeted snapshot and regression suite.

## Failed intermediate live run and resulting correction

The first targeted run exercised the draft resolver but did not complete the requested conversation. The first send returned `submitted` with a real draft URL. The UI then stayed in generation with an underscore/cursor after the expected token; this was not accepted as a completed exact reply. After stop/Escape recovery, the second call received the original draft URL and returned the saved URL with `submission_unconfirmed`. The second prompt remained in the composer, and no second user message was observed. No resend occurred.

This exposed a missing preflight condition: the helper had allowed a follow-up while a stop-response control remained present. The final code now returns `response_in_progress` without typing or consuming the attempt. A regression test covers active and disabled stop controls and subsequent successful reuse of that attempt after generation finishes.

That intermediate CLI run also requested another deletion confirmation, citing runtime Computer Use documentation. Cleanup is handled in a separate recovery turn. Thus an earlier pair of successful cleanups did not establish that confirmation requests can never recur. No automatic approval rejection was reported; the request came from the CLI model interpreting runtime instructions.

## Final targeted live result

The final-code run **passed**. The first helper returned `submitted` with an actual `WEB:` draft URL. After observing the same conversation at its saved URL, the CLI passed `first.url` unchanged to the second `sendOnce` call. That call returned `submitted` and the saved URL. Both exact responses (`WEBGPT_AB_FIRST_OK`, `WEBGPT_AB_SECOND_OK`) were observed as completed. The CLI did not need to rewrite the expected URL, recover a rejected send, or resend a message.

Cleanup returned `deleted_and_closed`; tab absence was verified. No additional parent instruction or manual cleanup fallback was required in this final run. The intermediate failed run was also deleted and closed through its separate recovery, and all test-owned browser resources were removed.

The final helper, tests and SKILL.md match the final targeted CLI snapshot. Session `turn_context` records verify `gpt-5.6-sol` / `low` for every primary and recovery turn. Skill validation and `git diff --check` pass.

| Run | Input | Cached input | Uncached input | Output | Tool operations |
| --- | ---: | ---: | ---: | ---: | ---: |
| followup | 323,809 | 270,592 | 53,217 | 2,349 | 10 |
| draft-transition | 681,162 | 642,048 | 39,114 | 4,628 | 21 |
| draft-transition-final | 427,045 | 403,200 | 23,845 | 2,872 | 13 |

The failed intermediate row excludes its separate cleanup recovery; cumulative and delta recovery counters are included in the [machine-readable evidence](2026-09-23-browser-transition-metrics.json). These runs used different regression prompts and intermediate code revisions, so their counters are diagnostic evidence, not a controlled cost comparison or a Codex quota savings estimate.

The observed draft transition now completes within the helper. Delayed user-turn confirmation is covered by deterministic fourth-observation tests and successful live submission runs; the live snapshots do not prove which internal observation confirmed a message. A stalled ChatGPT generation or a runtime confirmation request remains an external interruption that this helper cannot guarantee to eliminate. The final generation preflight prevents attempting a follow-up while an observed response is still running.
