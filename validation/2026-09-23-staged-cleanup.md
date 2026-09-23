# Optional staged permanent deletion — 2026-09-23

The user explicitly retained **permanent deletion** as the default. The normal `deleteAndClose` path remains one call with the same browser observation sequence. The new two-step path applies only when the current runtime requires a separate action-time confirmation; it does not create a new universal confirmation gate.

`prepareDelete(tab, ownedUrl)` opens the exact task's delete dialog, verifies the current URL/title and unique confirmation control, and returns a serializable tab/URL/title receipt. It does not click final Delete or close the tab. It marks the tab for handoff and reports missing/failed retention explicitly.

`confirmDeleteAndClose(tab, cua, browserId, receipt)` reacquires current evidence, verifies tab ID, URL, title and dialog, then confirms once and verifies redirect/closure. Changed targets do not trigger mutation. Cleanup and submission are mutually excluded. Receipts are not authorization, and a prepared dialog is not a deleted conversation.

## Actual CLI test

Both phases used Codex CLI **gpt-5.6-sol / low**, verified from session records. In an owned **Chat** at Extra High, WebGPT received only “Reply READY only. Do not use tools.” The observed reply was READY. No Worker task, plugin setup, connector replacement or service restart was used.

The first phase called `prepareDelete`, saved the receipt and intentionally ended with the live dialog retained. The resumed phase explicitly reset only the CUA JavaScript runtime once, reacquired that exact tab, imported the helper, and called `confirmDeleteAndClose`. It returned **deleted_and_closed**, persisted `consumed:true`, and verified tab absence. The conversation menu was not reopened, and the prompt was not resent. This validates preparation handoff and narrow completion across lost JavaScript bindings; the test deliberately separates the phases and does not claim that mandatory user confirmation has disappeared.

The total cumulative CLI counters, including both phases, were **543,109 input** (502,528 cached; 40,581 uncached), **3,160 output**, and **14 completed tool operations**. Resume totals were not double-counted. No whole-workflow token saving is inferred from this correctness test; the normal single-call path remains preferable when allowed.

## Validation and limit

All **116 local tests passed**, including serializable handoff, fresh-module confirmation, changed tab/URL/title refusal, ambiguous-click handling, retention failure, concurrent cleanup/submission and unchanged normal cleanup behavior. Independent review found no new ownership/destructive-action regression. Skill validation and whitespace checks passed.

Replay protection is partly in memory. The final call consumes its receipt before the click, but an old serialized pre-click copy in a newly reconstructed runtime does not inherit module-local attempt state. Preserve the updated receipt and never replay an old copy after an ambiguous click or runtime loss; inspect the existing outcome instead. This is explicitly documented and is not described as a crash-proof exactly-once transaction.

The test chat was permanently deleted and its tab closed. The persistent connector, Worker, tunnel and unrelated resources remain unchanged.
