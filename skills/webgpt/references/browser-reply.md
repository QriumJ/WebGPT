# Browser-only reply observation

Use this only when the user requested work without worker result submission. Worker-backed tasks
still use the quiet client wait and `submit_result`; do not add browser polling to that workflow.

After confirmed submission, import `waitForReply` from `<skill>/scripts/browser.mjs` and call
`waitForReply(tab, ownedChatUrl, {prompt: exactSubmittedPrompt})` in one browser-tool call with
sufficient runtime (for example 60 seconds). Default: up to four read-only observations separated
by five seconds. Optional `maxObservations` (1–10) and `intervalMs` (0–10000) must total at most
30 seconds of intentional delay; browser-call latency is additional. No UI mutations occur.

- `completed`: the latest matching user turn has a response with completion controls and no
  observed generation indicator. Review the returned current-reply `text`; reuse the returned URL.
- `in_progress`: the reply is still generating. Wait quietly or perform separately assigned work.
- `unconfirmed`: the helper lacks sufficient UI evidence; make one targeted observation to resolve
  the uncertainty, without retyping or resending. Repeated identical prompts can be ambiguous.
- `target_changed`: stop; the current conversation was not verified as the owned target.

`progress` is `changed`, `unchanged` or `unknown` across this sample. `unchanged` is not a timeout,
proof of failure, or permission to cancel. Do not turn helper calls into a tight model-driven loop.
Honor requested monitoring and waiting budgets. Otherwise increase the quiet interval when nothing
changes; if no useful action is justified, preserve the owned URL, prompt, partial reply and remaining
scope and report that generation is still pending. Do not claim completion or delete uncollected work.
For an observed error or explicit interruption request, use one grounded recovery and check its result;
do not repeat ineffective Stop/Escape/reload actions. A new assignment requires explicit scope, not a
blind replay of an uncertain send. Preserve the user's retention and workflow preferences.
