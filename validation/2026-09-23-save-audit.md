# Result-save diagnostics and controlled live validation

Three fresh Codex CLI sessions using `gpt-6-sol` with low reasoning completed the controlled matrix. Model/effort were verified from each session's turn context. All conversations used Chat with Extra High. No `exec resume`, new connector, tunnel restart, additional account, parent browser intervention, or renewed cleanup approval was needed during these cases.

## Changes

- Optional Worker instrumentation via `start({audit:true})` or `WEBGPT_AUDIT=1` records generated transport/request/run IDs, timestamps, transport status and tool outcomes. Known task IDs link receipts to tasks. Successful terminal responses retain exit/running state plus stdout length and SHA-256, not stdout content. HTTP receipt/outcome records distinguish transport rejection from tool-handler activity.
- Logs remain private, rotate at 1 MiB with one backup, and exclude URLs, headers, tokens, client request IDs, command/output text and error messages. Write failure warns once without changing tool behavior. Tests cover this and aborted-request deduplication.
- `node scripts/diagnose.mjs <task-id>` reads scoped task/tool evidence with bounded reads. HTTP failures and invalid-token/unassigned tool calls remain explicitly unscoped. Missing audit entries do not establish platform causation; artifact existence does not establish integrity.
- Recovery instructions distinguish command execution, saved result, verified integrity and collection. They stop repeated rejected calls and preserve diagnostic evidence without submitting on WebGPT's behalf or using an alternate route around a gate. Diagnostics are exceptional, not added to normal setup or monitoring.

The existing idle isolated test Worker alone was updated/restarted with auditing enabled. Its data, credentials, tunnel origin, connector and tool schemas were preserved. The primary installation was not restarted. Auditing was disabled afterward by restoring the original service environment; the Worker remained healthy and the tunnel unchanged. A subsequent health request left the audit file unchanged, verifying that capture was off.

## Controlled cases

All cases used the same existing connector, terminal grant/project, 30-second test backup interval, literal summary and expected 15-byte result `AUDIT_MATRIX_OK`. Only the assigned actions differed. One case per fresh session was run sequentially.

| Case | Assignment | Independent Worker evidence | Outcome |
|---|---|---|---|
| A | No terminal call; save the supplied literal | `submit_result` received and completed successfully; exact artifact independently read/hash-checked and collected | PASS |
| B | Run `printf AUDIT_MATRIX_OK`; save the supplied fixed literal | Terminal response hashes/total bytes match expected output; exit 0; submission received/succeeded; exact artifact collected | PASS |
| C | Run the same command; save its actual stdout | Same terminal/output/exit evidence; submission received/succeeded; exact stdout artifact collected | PASS |

All three summaries/results exactly matched the assignment. B/C output appeared in the initial execution response and exit 0 in the final terminal response; the audit preserves both facts rather than confusing `running:true` with completion. No scoped tool errors, unassigned tool failures or HTTP errors were observed in the retained capture. No permission prompts were observed. Each CLI permanently deleted its owned conversation and closed its tab; a parent read-only inventory independently confirmed none of the three tabs remained.

## Interpretation and limits

The prior security-status failures did not recur in these cases. This establishes that terminal execution followed by result submission can succeed through the unchanged tool interface. It does **not** establish the cause of the prior failures or prove they are fixed. Earlier failures lacked this capture; time, prompt payload, fresh model context and the diagnostic Worker restart differ from the historical runs. Three successful small cases are not a reliability or quota-saving benchmark.

The verified improvement is observability and bounded failure handling: a recurrence can now be compared with actual transport/tool receipts and non-plaintext execution evidence rather than only assistant narration. Even with logs, absent records may reflect disabled/partial/rotated capture, and unassigned requests cannot be attributed to a particular task without additional evidence. No tool annotation was weakened or changed to bypass review.

## Validation

- Full repository suite: 146 passed, 0 failed.
- Skill validator and `git diff --check`: passed.
- Read-only independent review: no actionable privacy, scope, rotation, or error-semantics defect found.
- Actual log keys independently checked against the metadata allowlist.
- CLI tokens/operation counts are in the adjacent metrics JSON, excluding parent and native agents. They do not measure account quota usage.

## Session identities

- A: `01a0cc5d-d925-7241-98f4-978e44df7d5f` — new session, `gpt-6-sol`, `low`, 13 completed tool operations.
- B: `01a0cc5f-c730-7722-b5ea-d36f12ad0e34` — new session, `gpt-6-sol`, `low`, 17 completed tool operations.
- C: `01a0cc62-a173-71e2-bcf7-d811132aa071` — new session, `gpt-6-sol`, `low`, 17 completed tool operations.

Private raw artifacts are retained at the workspace referenced by `/tmp/webgpt-save-audit-current`. The adjacent public evidence contains sanitized diagnostic output only.
