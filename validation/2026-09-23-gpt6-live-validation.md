# Fresh GPT-6 Sol CLI validation

All five phases started new `codex exec` sessions with `gpt-6-sol` and `model_reasoning_effort="low"`. Each model/effort was independently checked in its session turn context. No `exec resume` was used.

## Outcomes

| Phase | Outcome | Important qualification |
|---|---|---|
| Real origin-change recovery | PASS with parent intervention | The CLI migrated the idle owned tunnel to the wrapper, observed a changed origin and blocked registration, created/verified a replacement connector, and sent a Chat terminal smoke. While it waited, the user changed the permission preference to Always allow. The parent interrupted that CLI, selected the requested grant, collected `RECOVERY_GPT6_OK` with verified integrity, and deleted/closed the test chat. This was not an uninterrupted CLI PASS. |
| Fresh isolated installation | FAIL end-to-end | Local candidate installation, `npm ci`, 131 tests, isolated persistent services, connector discovery and terminal smoke succeeded. WebGPT reported `INSTALL_GPT6_OK` with exit 0 but reported three safety-layer blocks on `submit_result`; no Worker result was saved. The task was cancelled. |
| Text-only result diagnostic | PASS | A new session reused the isolated connector, saved exactly `RESULT_CHANNEL_GPT6_OK`, and collected it with verified integrity. No terminal, file input, alternate submission route, new setup or new permission grant was involved. |
| One full terminal smoke retest | FAIL | A new session reused the same connector and reported `RETEST_GPT6_OK`, exit 0. WebGPT again reported that OpenAI could not determine the security status of the `submit_result` request. No Worker result was saved; the task was cancelled rather than repeatedly retried or bypassed. |
| Corrected cleanup-only workflow | PASS | A new session created one Extra High Chat, observed `CLEANUP_OK`, then returned `deleted_and_closed`, without an additional approval question or tool rejection. |

## What changed and what remains unresolved

The user explicitly requested Always allow for WebGPT permission prompts. The helper now defaults to the unique observed Always allow button under the exact connector's permission heading, with owned-chat/task checks retained. Explicit narrower future user requests can choose conversation scope. The actual installation CLI selected the observed Always allow button. Subsequent diagnostic/retest sessions observed no new permission prompt. Browser tests: 72/72; full tests: 131/131.

The installation smoke now uses a 30-second backup interval only for that trivial setup test; normal task supervision remains unchanged. The original installation trial used this same interval via its test prompt. The local candidate snapshot was preserved, and installed instruction files were synchronized after the trial without restarting services.

Earlier CLI runs and the parent interpreted the browser confirmation notice as requiring renewed approval despite explicit task-chat cleanup authorization. No actual deletion tool rejection was observed. The user reaffirmed the exact deletion targets. The skill now distinguishes existing authorization and general notices from actual blocking responses, and forbids repeated approval loops for already authorized owned-chat cleanup. The final fresh CLI cleanup test verified the correction. Historical stops remain recorded; they are not rewritten as uninterrupted successes.

The two terminal-to-result failures remain unresolved. Evidence establishes WebGPT's reported security-status rejection and absence of a saved Worker result, not an independently audited root cause inside OpenAI. The primary and isolated local tool schemas were identical, and the text-only result diagnostic succeeded. These facts do not establish that all terminal-to-result flows are reliable. No unsafe workaround, annotation misrepresentation or alternate submission route was used.

## Permanent cleanup verification

The three stopped-run conversations were `Run Command And Report`, `Worker Diagnostic Test`, and `Smoke retest result`. After the user confirmed all three, all were verified permanently deleted. The first was already absent; direct URL loading showed ChatGPT's deleted-conversation notice. The parent confirmed deletion for the other two and independently re-opened their exact URLs, observing the same deletion notice. All associated and verification tabs were closed. Receipts were retired to prevent replay. The final cleanup-only test also deleted and closed its own chat without asking again.

## Scope and limitations

- Fresh installation used a separate config/data directory, ports, services, connector and local candidate copy. Existing Node, cloudflared and the signed-in browser were reused. It was not a clean-machine prerequisite test or installation from published remote main.
- The repaired primary installation and the isolated test installation remain running. No unrelated services, registrations or chats were removed. The isolated setup receipt continues to record the full smoke failure rather than claiming readiness.
- All test conversations used Chat, never Work. Internal prompts and evidence were English. No additional account, domain purchase or tunnel login was introduced.
- No claim of Codex account-quota savings follows from these tests. Adjacent metrics record CLI token usage and completed operation counts only; parent/reviewer cost is excluded.
- Private raw artifacts are referenced by `/tmp/webgpt-gpt6-current`. Public evidence below excludes bearer URLs, tokens and keys.

## Session identities

- `recovery`: `01a0cc25-a1a3-7e22-a9d7-156d3dc41843` — `gpt-6-sol`, `low`.
- `install`: `01a0cc30-17aa-73a2-9122-9a3e81bd1860` — `gpt-6-sol`, `low`.
- `result-diagnostic`: `01a0cc3b-9334-7082-b9fe-d711eab6130f` — `gpt-6-sol`, `low`.
- `smoke-retest`: `01a0cc3e-2b3b-7a91-8d64-ea9f879f55e7` — `gpt-6-sol`, `low`.
- `cleanup-recheck`: `01a0cc45-8b8c-7e42-80b1-948d9419d75d` — `gpt-6-sol`, `low`.
