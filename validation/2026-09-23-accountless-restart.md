# Accountless tunnel restart validation

Overall result: **PASS**

## Results

| Check | Status | Evidence |
|---|---|---|
| Real accountless tunnel origin discovered into private state | PASS | The current `scripts/tunnel.mjs` started the approved existing `cloudflared` executable and published a valid running state in the workspace-private data directory. |
| Matching verified `publicOrigin` passes the client guard | PASS | `forwardingOrigin` returned the current managed origin when the private verified origin matched. |
| Restart obtains current state and mismatched origin blocks `register` before task creation | PASS | A clean wrapper stop followed by a second real Quick Tunnel start produced a different current origin. `request('register', ...)` returned `connection_needs_repair` before contacting the controller sentinel; no task state file existed before or after the call. |
| Stopped state blocks `open` | PASS | After stopping the first wrapper, `openProject` returned `tunnel_unavailable` before registration. |
| Existing repository tests | PASS | `npm test` completed with 127 passed, 0 failed, 0 skipped. |
| Test-process cleanup | PASS | Both isolated tunnel wrappers and both local HTTP servers were stopped. Final private tunnel state is `stopped`; no test wrapper remains running. |

## Scope and limitations

- This was a bounded transport and client-guard validation using two real accountless Cloudflare Quick Tunnels. Each tunnel startup was bounded to 45 seconds.
- The validation used a private `WEBGPT_CONFIG` and `dataDir` under this workspace plus a harmless local HTTP server on an OS-assigned port.
- It used the existing approved `cloudflared` executable only through the current `scripts/tunnel.mjs`. Nothing was installed.
- No tunnel account, domain purchase, tunnel login, or manual onboarding was used. This preserves the intended one-Install-prompt setup path; no Install prompt or UI flow was exercised during this test.
- No browser was opened. Plugins, connector registrations, chats, existing WebGPT services, and private user configuration were not inspected or changed.
- This result does **not** claim successful ChatGPT connector repair, UI registration, tool-schema discovery, or end-to-end browser execution. Those were intentionally out of scope.
- Public origins and credentials are omitted from this report and public validation output. Private transient state remains only in the workspace validation directory.
- Repository source and the WebGPT skill were not edited.

## Controller verification

The actual Codex CLI session used `gpt-5.6-sol` with `model_reasoning_effort="low"`, verified in its session turn context. Session: `01a0cc17-4c69-7ea1-8aa8-367ab90f17c8`.

The parent reviewed the driver and redacted results, checked the skill validator and `git diff --check`, and independently confirmed that only the existing cloudflared service (PID 39785) remained. Existing services were not migrated or restarted. The new wrapper applies to new installations and the next necessary managed tunnel restart; unchanged legacy forwarders do not gain this guard until migrated.

The normal registration path adds only local state/PID reads, with no extra model turn or network preflight. A separate review found and resolved overlapping-wrapper state ownership using an exclusive lock. Hard-killed wrappers may leave an uncertain child/lock; Codex must reconcile the owned processes before restarting. This is documented recovery, not an unattended self-healing claim.

The permanent-deletion default and Chat-only requirement remain unchanged. No clean installation, ChatGPT connector repair, or quota-saving comparison was performed in this validation.

Private driver and raw CLI artifacts are retained in the temporary workspace identified by `/tmp/webgpt-accountless-current`; public metrics are in the adjacent JSON file.
