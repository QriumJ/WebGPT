# Setup

Install and verify a real browser-to-terminal connection. Honor the user's Install authorization;
ask only for genuinely user-only actions such as sign-in. `webgpt open` already authorizes creating
its project connection, sharing its private URL with ChatGPT and accepting matching dialogs;
perform these actions without asking again. Preserve unrelated
services, tabs and configuration. Do not delegate installation to WebGPT or substitute Chat On
Steroids, another connector or an API model for the bundled WebGPT Worker.

## Install and browser

Resolve the branch in the user's URL to a commit and install `skills/webgpt` at that commit using
Codex's skill installer. Do not replace `dev` with `main`. Record the revision privately. Preserve
customized installations unless replacement was requested. Before replacing scripts, stop only
the identified idle WebGPT worker; preserve data and credentials, and never stop active tasks.

Use Node.js 22+. Run `npm ci` and `npm test` inside the installed skill directory. Install missing
prerequisites from official sources. `node-pty` supplies the real PTY; if a prebuilt is unavailable,
install its documented native build prerequisites.

Discover browser tools, including deferred tools. Through documented APIs, inspect the user's
existing signed-in ChatGPT browser and open an owned **Chat** tab there. Never use Work, including
connector launch shortcuts that switch to Work; select the connection from Chat instead. Never create a fresh profile, copy
cookies or use private browser APIs. Verify the requested mode (Extra High by default). If
browser control is missing, configure the supported browser plugin. Ask only for the missing
sign-in/extension approval, not navigation or commands you can perform yourself.

## Worker

Read [workspace.md](workspace.md). This version grants full terminal access as the OS user, not
file-only access. A project cwd is not a sandbox. The README Install prompt authorizes this change;
never silently convert an old file-only grant.

Worker and client share optional `~/.config/webgpt/config.json`:

```json
{
  "dataDir": "/absolute/private/webgpt-data",
  "mcpPort": 43137,
  "controlPort": 43139,
  "publicMcp": true
}
```

Defaults: `~/.local/share/webgpt`, ports 43137/43139, `publicMcp:false`. Use actual OS paths.
`WEBGPT_CONFIG` selects another config; `WEBGPT_DATA_DIR` overrides dataDir. Keep config/data outside
projects and the installed skill. Protect data with POSIX mode 0700 or private Windows ACLs.
Never print keys, tokens or credentials.
Save the verified HTTPS forwarding origin as `publicOrigin` in this config (origin only, no secret
path). This is the verified Worker connector origin, not merely the latest tunnel address;
normal use must not search setup logs for URLs.

Check port ownership; do not displace another process. Start
`node <installed-skill>/scripts/worker.mjs`; verify ready output, MCP `/health`, and
`node <installed-skill>/scripts/client.mjs status`. Use the OS service manager for persistence
after Codex exits, restart after unexpected exits, and record the owned service. Keep the same
data directory. The Worker replaces a provably stale lock itself (same host with an exited owner
PID, or written before this boot). If startup still reports a locked data directory, verify
before recovering `worker.lock/owner.json` that its host/PID is no longer using that directory.

Persist an explicit Worker service `PATH` from the installation environment where `node` and
`npm` actually run. Preserve its ordering and include their resolved executable directories;
do not assume launchd/systemd inherits the interactive shell's PATH, hardcode Homebrew paths,
or source shell startup files on every task. On macOS use the owned launchd plist's
`EnvironmentVariables.PATH`; use the equivalent service environment on other platforms.
On Windows a hidden logon Task Scheduler launcher works; let `cmd.exe`, not PowerShell, redirect
service output, because Windows PowerShell 5.1 under `$ErrorActionPreference='Stop'` stops the
launcher and its Worker at the first stderr line.
For an existing idle Worker, update only its service environment and restart only that Worker;
keep the tunnel, connector, keys and data. Verify through a Worker terminal command without
an inline PATH override, not just through Codex's terminal. Record this check in `setup.json`.

## ChatGPT connection

Reuse the verified **WebGPT Worker** HTTPS connection and configuration. Inspect its URL and live
tool schemas, not just its name. No OpenAI Platform login, API key, organization role or Secure
MCP Tunnel account is needed.

1. Set `publicMcp:true` before forwarding. The worker creates private `mcp-path.key`; MCP is served
   only at `/mcp/<key>`. Verify plain `/mcp`, wrong routes and invalid task tokens are rejected.
2. Reuse authorized HTTPS forwarding or install official `cloudflared` and run
   `node <installed-skill>/scripts/tunnel.mjs /absolute/path/to/cloudflared` under the OS service
   manager, with the same config/environment as the worker. The wrapper uses the configured MCP
   port and privately maintains `dataDir/tunnel.json`; read its origin to build the connection URL.
   Quick Tunnels need no account. Preserve other tunnel configs. Never forward the controller or
   project directory. Keep a healthy existing/custom forwarder; do not restart it just to migrate.
   At its next necessary restart, use the wrapper for managed Quick Tunnels.
3. In ChatGPT Plugins, configure **WebGPT Worker** with Connection: URL, the HTTPS origin plus
   `/mcp/<key>`, and no OAuth. Privately read the URL into the form, never prompts/screenshots/logs.
   The URL is a bearer capability plus task-token authentication. Cloudflare terminates HTTPS;
   use the user's existing terminal/connection authorization and accept matching setup dialogs.
4. Refresh discovery and verify `exec_command`, `write_stdin`, `get_task`, `read_input`,
   `submit_result`, with no old CRUD tools. If the UI cannot update a connection, verify a
   replacement before removing only the obsolete WebGPT registration. Preserve other plugins.

Keep the one-prompt Install workflow: Codex handles prerequisites, services and connection UI.
Do not add an ngrok account, domain purchase, tunnel login or manual setup checklist unless the
user explicitly requests that alternative. Quick Tunnel addresses are not permanent; recovery
requires a running Codex with browser access, not unattended background UI automation. Rotate a
leaked route key while the owned worker is stopped. No public plugin publication is needed.

## Origin recovery

`register` checks managed tunnel state inside its existing call, before creating a task. No extra
normal-path command, network probe or Plugins visit is needed. `connection_needs_repair` means
its observed origin differs from the verified Worker connector; `tunnel_unavailable` or
`tunnel_state_invalid` requires inspecting only the owned service first. Do not delete the state
file or change `publicOrigin` merely to silence a guard. This local check detects observed lifecycle
changes, not every remote outage. The wrapper replaces a provably stale lock itself (wrapper exited
and, on Windows, no surviving child; or written before this boot). A remaining `owner lock exists`
error means Codex must inspect the owned `tunnel.lock` PID and service/child processes; remove a
stale lock only after confirming its wrapper and child are gone, then restart the owned service.
Never delete a live or uncertain lock or ask the user to run this maintenance manually.
Legacy/custom forwarders without the state file retain their existing recovery behavior.

On an actual origin change, read `tunnel.json` and the saved `setup.json` once. Preserve the worker,
keys and active tasks. Update only the identified Worker registration's URL through documented UI,
then verify its five tool schemas. If editing is unavailable, verify a replacement and update the
saved identity/Chat launch URL; preserve unrelated registrations. Save the new `publicOrigin` only
after this connector verification, then run the trivial end-to-end test below. Record incomplete
verification and its exact next action if interrupted; never claim the installation is ready from
the local guard alone. Retry the blocked registration only after repair; the guard created no task.
Do not resend an already submitted assignment automatically.

`open` uses the current running tunnel origin directly and returns a new origin-specific connection
name; follow [open.md](open.md) to create it only if absent. It does not require repairing the shared
Worker registration, renew a lease, or repoint an old project connection.

## End-to-end test

Creation/tool discovery alone does not enable Chat access. Complete the exact connector's
first-use Add/Connect dialog under the existing setup authorization; this is connection setup,
not the terminal permission handled by `recoverPermission`. Select **Always allow / 항상 허용**
whenever offered for WebGPT setup or terminal permissions. Keep it connected.

Register access to an owned temporary project with `--backup-ms 30000` for this setup smoke only,
so a late permission prompt gets one due check without the normal 20-minute task interval.
In one message using the requested mode (Extra High by default), ask WebGPT to
use **WebGPT Worker** to run `node --version && npm --version` and print a short value through
the terminal without changing PATH or using absolute executable paths, providing only the task token
and assignment plus the short requirement to save the final outcome through the Worker. Verify
that the result is submitted; do not duplicate the schema's completion protocol.
The command should execute in about one second; model/browser latency is separate.
Do not assign development, multiple file operations or interactive exercises to this smoke test.

Verify the saved command output/exit status, result/hash, callback and empty backup
deadline. Acknowledge the result. Save evidence, permanently delete the owned test chat and close
all its task tabs per SKILL.md without asking again. Cancel abandoned tasks. A local
test or another connector's successful command does not establish installation success.

Save a compact private `setup.json` beside the selected config file with installed path/revision,
config path, owned worker/tunnel
services, connection name (`connectionName`) and observed registration ID (`registrationId`,
`plugin_asdk_app_...`, to disambiguate duplicate names),
browser/mode, verified Chat selection/launch URL and PASS/FAIL/NOT_RUN evidence, without credentials.
Record a Chat launch URL only after observing that it selects the correct registration in Chat;
do not reuse a Work launch link. Normal tasks select this existing connector without reopening Plugins.
On interruption, record the exact next action and resume the same installation. Reuse verified
setup during normal work, including new Codex sessions. Task cleanup keeps the verified connector,
worker and tunnel running; reopen Plugins only for observed connection failure or requested setup
changes. Report the concrete blocker instead of claiming partial setup is ready.
