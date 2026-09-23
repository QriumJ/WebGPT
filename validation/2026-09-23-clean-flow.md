# Fresh installation and real-work flow — 2026-09-23

## Scope and verdict

Local uninstall/reinstall and actual delegated work passed. This was the current uncommitted local candidate, not the published GitHub main Install URL. Two fresh Codex CLI sessions used `gpt-6-sol` with reasoning `low`; neither resumed an earlier session. No parent assistance or additional prompts were delivered to either CLI session.

A fully empty ChatGPT account baseline was **not** achieved: uninstalling connections removes their installed state but leaves the account-owned definitions. Six old WebGPT definitions were later observed; the official Plugin Management uninstall tool reported all six `not_installed`. Their old local Worker, keys, and tunnel were removed. The new CLI encountered a name collision and created `WebGPT Worker Local 20260923`. Do not describe this run as proving complete account-definition removal.

## Removal and preservation

Four old launchd services were stopped. Sixty-five owned paths (runtime/config, dedicated cloudflared, service plists, installed test profiles, temporary validation directories, connector caches, one regenerable tool cache) and 35 old temporary project-trust sections were removed. Source, repository validation records, shared Node/Codex/browser tools, and global conversation/session history were retained. A freshly opened installed-plugins page showed zero WebGPT entries before the install run. Account-owned definitions were not included by that installed-list check; that was an incomplete baseline check.

## Installation flow

Fresh thread: `01a0cc70-8f7a-7251-bf36-958297dae61a`.

The CLI copied the candidate to the normal `~/.codex/skills/webgpt` location, installed dependencies, passed all 146 tests, configured persistent Worker/Quick Tunnel services, created the ChatGPT connection and accepted Always allow. All 27 source manifest files match the installed files. Chat and Extra High were directly observed. The smoke result reports `WEBGPT_SMOKE_OK`, exit 0; the saved artifact was independently hash-verified, collected, and its backup deadline cleared. The helper returned `deleted_and_closed` without a repeat approval request.

Elapsed CLI session: 365.015 seconds. Completed tool operations: 82. Reported uncached input tokens: 100,207; output tokens: 8,271. Setup included UI exploration and a redundant finish call after backupDue before recovery/resume. No per-command Worker audit was enabled, so terminal output/exit are the saved WebGPT report rather than an independent transport audit.

## Fresh-session actual work

Fresh thread: `01a0cc76-ac9d-7d53-8762-00a8574eb06c`.

A bounded project requested one `normalizeTags` function and Node built-in tests. The CLI reused the installed connector without visiting Plugins or setup, dispatched in Chat/Extra High, and made no implementation writes itself. WebGPT's saved result and the resulting files show the implementation. The CLI collected the verified result and permanently deleted/closed the task chat. No further permission prompt was observed. Parent tab inventory confirmed no test tabs remained.

Independent validation passed the 3 supplied tests plus 18 acceptance cases covering empty/frozen/Unicode/order/duplicates/nonmutation and invalid input. Both persisted tasks are completed and collected with null backup deadlines and matching artifact hashes. Current Worker health is HTTP 200; config is mode 0600 and data directory 0700.

Elapsed CLI session: 144.408 seconds. Completed tool operations: 16. Reported uncached input tokens: 39,242; output tokens: 1,769. These telemetry counts are not a measured Codex account-quota saving.

## Remaining findings

- Old account-owned WebGPT definitions remain despite being uninstalled; they caused a name collision. Available UI removal and official uninstall did not establish definition deletion.
- WebGPT reported an initial `npm` lookup failure under the launchd Worker environment and then supplied an explicit PATH to pass. Fresh setup should provide a verified development-tool PATH, avoiding this repair in delegated work.
- The normal work CLI tried git status/diff in a fixture without a Git repository. The commands failed unnecessarily; implementation, tests, collection and cleanup still succeeded.
- setup.json has no verified Chat launch URL; normal use successfully selected the existing connector from Chat. This is functional but leaves room to reduce selection work.
- No account quota comparison or broad reliability claim is established by one installation and one small work sample.

The new installation is left running for continued use. Both test conversations were permanently deleted. The source and sanitized validation evidence are retained.
