# Actionable recovery

Follow the user's requested monitoring and retention. Otherwise recover only from explicit
help/failure, a returned actionable status or a due backup check. Quiet waiting is not failure.
Preserve the last observed state, work and remaining scope; try one justified recovery. Do not
repeat ineffective Stop/Escape/reload actions, blindly replay assignments or invent a timeout.
Stop repeated no-progress retries and report the actual blocker.

## Missing connection identity

A successful registration with `connection.status: missing` or `invalid` still created the task.
Retain its ID/token. Read only `setup.json` beside the selected `WEBGPT_CONFIG` file, or
`~/.config/webgpt/setup.json` by default. Resolve the missing/invalid name and registration ID using
verified installation evidence; follow setup.md only if the connection actually needs repair.
Do not repeat registration or scan all configuration/skill files. If identity cannot be established,
report the blocker and cancel only the abandoned task. Normal `ready` responses need no setup read.
The returned metadata is saved identity, not proof of current remote connectivity; handle an
observed UI failure through the existing recovery flow.

## Browser submission

- `needs_chat_surface`: return to Chat and verify its live UI before retrying. Never use Work
  as a fallback for missing tools or connection errors.
- `needs_mode` / `needs_composer`: fix grounded preflight and retry; no send was attempted.
- `response_in_progress`: let the existing reply finish before retrying; no send was attempted.
- `submission_unconfirmed`: inspect the existing user turn without retyping or resending.
  A `needs_chat_surface` reason after a send is an ambiguous existing attempt, not permission to
  replay it. Reconcile it without continuing work in Work. Wait only after observing submission;
  never infer it from a changed URL alone.
- `target_changed`: re-establish exact task ownership before acting.
- Startup permission `needs_authorization`, `needs_ui` or `unconfirmed`: inspect the exact named
  connector prompt and select **Always allow / 항상 허용** when offered under the WebGPT
  authorization. Never infer permission from submission alone or bypass runtime gates.
  `not_observed` does not prove terminal readiness; do not start recurring startup checks.
- `retention: unconfirmed`: preserve the owned tab through the documented runtime before leaving
  the turn. The helper marks attempted task tabs for handoff where supported; do not resend.

Unknown UI requires fresh AX observations and documented actions. Use `getAXState({emit:false})`
and return only relevant controls in the actual UI language, expanding evidence only as needed.
Do not silently replace a blocked WebGPT assignment with Codex implementation.

For a late Worker permission prompt, the due check can use one bounded helper call:

```js
var {recoverPermission} = await import('<skill>/scripts/browser.mjs');
var checked = await recoverPermission(tab, ownedChatUrl, {
  prompt: originalPrompt, connectorName, authorizeConversation: true
});
```

It verifies the owned chat and unique latest user assignment before selecting the exact
connector's **Always allow** option by default. If absent, it returns `needs_ui` rather than silently
choosing a narrower grant; inspect the actual controls. An explicit narrower user request may set
`permissionScope:'conversation'`. It never resends. With `not_observed`, review the returned
`replyObservation` for completion/help/failure before resuming; this uses the same screen read.
Unknown or truncated evidence may require one targeted inspection. Neither absent permissions nor
unchanged text proves progress. Do not turn this into recurring permission polling.

## Same-chat follow-ups

Honor an explicit same-chat request by adding `{taskId: uniqueAttemptId, expectedUrl: ownedChatUrl}`
to `dispatch` options alongside any startup options. The attempt ID prevents duplicate messages;
it is not the Worker token. A finished run needs a fresh registered task/token; a running run keeps
its token. Otherwise use a new chat with only the remaining scope and necessary saved evidence.

## Worker state

On `backupDue`, make one minimal browser check for completion/help, then run
`node <skill>/scripts/client.mjs resume <id>` to acknowledge that check and quietly wait/collect
in one command. Do not call `finish` again first. Resume only the task actually checked; for custom
multi-task waiting, use `checked <id>` for each observed task, then `finish` on remaining IDs.
A due check is not cancellation. On `recoveryRequired`, reconcile the reported task state before waiting.
Use scoped `status <ids>` after interrupted/ambiguous collection; do not blindly retry mutations.
Results remain saved even if acknowledgment already succeeded.

`partial` completes this run only: use its changed files, PASS/FAIL/NOT_RUN evidence, remaining
scope and continuation context. Abrupt stops may have no saved result; preserve work before
narrow recovery. Finished same-chat continuations need a fresh registered task/token; never revive
an old token. Reconcile pending tasks after context recovery.

Surface `cleanupError`: saved output does not prove terminal commands stopped. Abandon a task
with `node <skill>/scripts/client.mjs cancel <id>`; cancellation revokes access and stops its
sessions. Finished tasks are not rescheduled. Preserve unrelated worker sessions/services.

## Custom waiting

`finish` renews empty responses quietly; unrelated events remain untouched. Read-only transport
and HTTP 502/503/504 failures receive at most two quiet retries; mutations are never automatically
retried. Registration schedules backup checks; submission/cancellation clears them.
Use `wait <ids>` only for notification without collection, then read the saved artifact and run
`collect <id>` to verify/acknowledge. Unlike `finish`, `collect` returns metadata, not result text.

## Missing saved result

A successful terminal command is not a submitted result. If WebGPT reports a tool rejection,
preserve its exact evidence and check this task once; do not keep retrying the same rejected call,
submit on WebGPT's behalf, or use a terminal backdoor around the gate. Preserve partial work and
cancel only the conclusively blocked task. Do not mark the assignment complete from chat prose.

For an unresolved recurrence, opt in to diagnostics on the identified idle worker service with
`WEBGPT_AUDIT=1`, then restart only that worker. Keep its data/keys, tunnel and connector. Do not
interrupt active tasks or add this to normal setup. Restore its previous environment after the
bounded diagnostic. The private `mcp-audit.jsonl` and one rotated backup are capped at about 1 MiB
each. They contain transport/tool receipts and outcomes; terminal outcomes include exit status and
output length/hash, never command/output text, tokens, URLs or error-message content.

Run `node <skill>/scripts/diagnose.mjs <task-id>` once for scoped evidence. A received submission
followed by a Worker error differs from no observed submission. Missing/rotated records or logging
failure limit that conclusion; unscoped HTTP errors do not identify a particular task. WebGPT's
statement about a platform block is not by itself an independently verified cause. Save the
redacted diagnostic before deleting the owned chat, and report command execution, result saving,
integrity verification and collection separately. Normal task monitoring remains unchanged.

## Chat cleanup

After preserving/reviewing results, cleanup remains authorized unless the user requested retention.
Use only the exact owned chat and matching dialog; fresh observations must ground any fallback.
Never delete uncollected, unrelated or user-controlled `open` chats. Keep permanent deletion as
the default; do not silently substitute retention or archiving.

Existing authorization covers permanent deletion of the owned task chat. General confirmation
notices do not create a new approval step. Do not ask again after a user has confirmed the exact
targets, including across CLI sessions. Distinguish model hesitation from an actual tool rejection.

Use a prepared receipt only for a user-requested pause/review or an actual blocking tool response
that requires a user-only confirmation. First preserve the exact target:

```js
var {prepareDelete} = await import('<skill>/scripts/browser.mjs');
var prepared = await prepareDelete(tab, ownedChatUrl);
```

A verified `deletion_prepared` receipt identifies the exact tab/URL/title; resolve any
`retention: unconfirmed` before leaving the turn.
Preserve that receipt. If an actual blocker remains, quote the tool response and explain the
specific user-only action; do not invent a new approval requirement. The receipt is not proof of
deletion or authorization. When the specific action is already authorized, immediately reuse/reacquire
only that owned tab, reimport helpers after a runtime reset, and call
`confirmDeleteAndClose(tab, cua, browserId, prepared)`. This rechecks the dialog without reopening
menus; a changed target or ambiguous result stops mutation. The final call consumes its in-memory
receipt: preserve that updated state, and never reload an older pre-click receipt after an ambiguous
attempt or runtime loss. Inspect the existing outcome instead. Resolve other helper statuses before
claiming readiness. Do not rerun the assignment, reconnect the plugin or resubmit results.

Use the normal single-call `deleteAndClose` for the authorized cleanup. A policy notice, model
request for permission and actual tool rejection are different evidence; report them accurately.
Never claim deletion from tab closure alone or leave cleanup pending merely to ask again.
