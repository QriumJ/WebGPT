# Reply observation and development delegation evaluation

## Changes

`waitForReply(tab, expectedUrl, {prompt})` performs bounded read-only observations for explicitly browser-only work. It binds to the latest uniquely matching user prompt and the owned conversation, and accepts completion only with assistant response actions and no observed generation indicator. It returns current reply text, status and progress metadata rather than a full accessibility tree. Defaults are four observations separated by five seconds; configured intentional delay cannot exceed 30 seconds. Browser-call latency is additional.

Unknown layouts, repeated-prompt ambiguity and changed ownership fail closed. An unchanged sample is not a task timeout or permission to cancel. Worker-backed delegation continues to use saved results and the quiet worker wait, without browser polling. Recovery guidance now preserves pending work and stops repeating ineffective Stop/Escape/reload actions. User-requested monitoring and work allocation remain authoritative.

Local regression suite: 62 tests passed. Skill validation and whitespace checks passed. A real CLI browser-only test returned `completed` with exact reply `WEBGPT_REPLY_READY` on its first observation. Thus that live run validates recognition and integration, not the benefit of multiple internal waits; delayed/progressing/unchanged states are covered by deterministic tests.

## Development comparison design

Both independent CLI controllers use `gpt-5.6-sol`, reasoning `low`, with fresh sessions. Two isolated projects start with identical [task specification and stub files](fixtures/event-summary/TASK.md). The assignment implements a Node event-log library and CLI: strict record/calendar validation, deduplication, time range filtering, grouped counts/statistics, nearest-rank p95, UTC dates, stdin/file/gzip input, error handling, tests and usage documentation.

The direct controller implements and tests locally. The delegated controller uses the real signed-in Web ChatGPT Extra High interface and the actual WebGPT Worker terminal connector; it dispatches, waits, collects and reviews. Native subagents are disabled in both measured controllers. The parent agent's preparation and the separate helper-development agent are outside the measured workload.

A separate [12-case evaluator](evaluate-event-summary.mjs), not disclosed to either implementer, is applied afterward to both results. The seed specification and original tests must remain intact. This is a bounded development sample, not an installation smoke test or evidence for every task size.

Connection provisioning is measured separately, because a reused connection is the intended normal workflow. The parent creates a private worker/tunnel before the setup controller registers its test-only ChatGPT connection. Parent setup commands, network download, final service shutdown and independent evaluation are not included in CLI token counters. Browser cleanup and result collection belong to the delegated task; removal of the temporary connector belongs to setup lifecycle.

No reported token ratio is an estimate of Codex Usage Limit accounting. Cached input, uncached input and output are shown separately; WebGPT model usage is not part of the Codex CLI counters. Small tasks can be dominated by orchestration and connection costs.

## Direct run

The direct controller completed the implementation, added tests and documented the CLI. Its own suite passed 10 tests, and the independent evaluator passed all 12 cases. Initial counters: 171,933 input, 132,352 cached input, 39,581 uncached input, 8,934 output. Six tool operations were completed (four shell calls and two file changes). One preliminary `git status` failed because the fixture was not a Git repository; the implementation continued without intervention.

The fixture is a small development task. A larger workload, different cache state, existing controller context, or a user-requested concurrent Codex assignment could change the tradeoff. Neither controller received the other implementation or independent evaluator results before finishing.

The browser helper's final narrow refinement rejects a generic content-level Copy button as completion evidence. Its regression test was added after the live browser check; the observed dedicated response-copy path is unchanged. The live worker benchmark does not invoke browser-only reply observation.

## Delegated outcome: failed before implementation

The initial controller verified message submission and entered one quiet worker wait. At the default 20-minute backup check, it found a connector permission card that had prevented the first terminal request from proceeding. The card offered Allow once and a scope dropdown whose description referred to this conversation. The controller selected Allow once and resumed waiting.

The parent then interrupted the controller's wait and requested inspection of conversation-scoped access, preserving the same task and conversation. At recovery, the task had already submitted `failed`; there was no pending permission control. No broader permission was granted, no task token was revived and no rejected command was replayed. The result stated: implementation NOT_RUN, tests NOT_RUN, no files changed, required terminal reads blocked before execution. The controller collected and integrity-verified this failed result.

All delegated seed files remained byte-identical. The independent evaluator initially reported one passing negative-only group because any exception, including the stub's `Not implemented`, satisfied it. The assertion was corrected to check the task's already-required physical line number. Both implementations were reevaluated: direct **12/12**, delegated **0/12**. The specification and expected behavior did not change; initial and corrected evaluator hashes are recorded.

A separate cleanup instruction authorized inspection of the rejected tool result without replay or bypass, followed by deletion of the collected test chat. The UI did not expose a usable raw rejection reason. The exact blocking layer and reason therefore remain **UNKNOWN**. WebGPT's attribution to an execution safety layer is a reported explanation, not independently established fact. The conversation was then deleted and its owned tab closed.

Two additional parent instructions were required: recovery and diagnostic cleanup. The initial controller was interrupted to avoid another full blind wait; this intervention is part of the failed run, not omitted from the totals.

| Same development assignment | Direct Codex | WebGPT delegation, including recovery/cleanup |
| --- | ---: | ---: |
| Independent evaluator | 12/12 | 0/12, unchanged stub |
| Input tokens | 171,933 | 3,411,439 |
| Cached input | 132,352 | 3,299,712 |
| Uncached input | 39,581 | 111,727 |
| Output tokens | 8,934 | 8,342 |
| Completed tool operations | 6 | 33 |
| Extra parent instructions | 0 | 2 |

These are session totals, using the final cumulative counter for resumed sessions rather than summing cumulative counters. The direct result was usable; the delegated result was not. Its slightly lower output count is not a successful efficiency improvement. No quota savings claim is supported by this comparison.

## Resulting workflow correction and limits

SKILL.md now calls for one bounded startup permission check for the named connector on a new worker chat, before quiet waiting. Only assignment-authorized prompts may be handled; conversation scope is preferred when offered, and unrequested persistent grants are prohibited. Submitted chat text is not proof of ready terminal access. Repeated progress polling is still excluded.

This startup instruction was added after the observed failure; it has not yet passed a fresh successful end-to-end development run. It addresses late detection, not the unknown terminal rejection. The worker's truthful destructive/open-world tool annotations were not weakened, and no rejection was bypassed.

The reply helper and bounded observation behavior improved and passed their tests. The development benchmark exposed a more important unresolved issue in actual tool execution/permission handling. Before presenting this tool as a proven way to reduce Codex usage for development, obtain the underlying rejection evidence and a successful matched implementation run. A short chat or terminal-print smoke test is insufficient proof.

## Setup lifecycle and final cleanup

The setup, browser-only helper check, its confirmation recovery, and connector removal used 2,686,471 input / 2,513,152 cached input / 173,319 uncached input / 6,726 output tokens across 43 tool operations. This is additional to the delegated-workload table and is not amortized into a claimed per-task saving.

All owned test chats/tabs were removed, the test-only connector was removed and verified absent, and the parent terminated only its worker and tunnel after confirming all tasks were settled and collected. Both processes exited successfully and ports 43137/43139 had no listeners. Default WebGPT configuration was unchanged. Benchmark projects and private raw evidence are retained separately for audit. No credentials or private chat URLs are included in this report or its [machine-readable metrics](2026-09-23-development-metrics.json).
