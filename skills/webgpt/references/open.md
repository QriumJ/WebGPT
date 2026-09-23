# Open — user-controlled mode

For `webgpt open [project path]`, use the named project or current directory. This mode overrides
the delegation monitoring and cleanup defaults. Use the existing worker configuration; do not read delegation instructions.
The request already authorizes creating the project's terminal connection, sharing its private URL
with signed-in ChatGPT and accepting the matching connection dialogs. Do not ask for consent again;
ask only for an action the user must personally perform, such as signing in.
Run `node <skill>/scripts/client.mjs open [project path]` once. It returns a stable connection name
and privately usable URL, reusing a live connection for the same project without renewing its lease.
Open a new **Chat** tab (never Work) and select the returned connection name in its composer plugin menu. If present,
handoff immediately: no setup reads, re-registration, process scans, probes or worker restart.
Only if absent, register that exact name and URL through [setup.md](setup.md)'s connection steps, then select it.
A managed tunnel supplies its current origin automatically; tunnel errors route to
[origin recovery](setup.md#origin-recovery) before opening a tab.
If `needsPublicOrigin` is returned for legacy/custom forwarding, resolve its origin once and save
`publicOrigin` in the worker config; do not repeatedly search old notes or change the tunnel.
Never repoint an existing connection to a new session. Expired sessions receive fresh names and URLs.
This connection exposes only token-free terminal tools and binds the project on the server.
Preserve the current model unless specified. Do not type or send any message, task, token or probe;
the user starts the conversation. Verify the selected connection and absence of sent messages,
mark the tab as a deliverable using the browser's supported keep-open mechanism, and hand it over.
If connection setup fails, cancel only a newly created session (`reused:false`), not a reused one;
report the failure and never substitute a bootstrap
message or an unconnected tab. Stop after handoff: no wait,
collection, backup checks, chat deletion or tab closure. The user may send unlimited messages.
The worker automatically revokes access after 24 hours without terminal use, checked within one
minute; each successful terminal call renews it, and running commands are protected. Expiry never
deletes chats, tabs or project files. The persistent worker, not Codex, handles expiry.

## Connection behavior

Use `node <skill>/scripts/client.mjs open /absolute/project`.
The path is optional and defaults to cwd. The command reuses an unexpired session for the canonical
project path and returns `reused`, `connectionName`, and a private `connectionUrl` when `publicOrigin`
is saved in config (`needsPublicOrigin` otherwise). Select the named connection in a blank chat;
create it only if missing. No per-open registration, setup scan or service restart is needed.
Reopening does not renew the lease; only terminal use does. Chats for the same live project share
that lease. Expired/cancelled URLs stay revoked; a fresh session gets a new URL and name.
Changing the forwarding origin also changes the name; do not repoint an old connection.
The URL is the session capability: keep it out of chat messages, screenshots and reports. No token
argument or bootstrap message is needed. Only `exec_command` and `write_stdin` are exposed;
the route binds the project and rejects other tools or explicit token arguments. Never repoint an
existing connection to another session: old chats must not gain access to the new project.
Terminal calls renew
its 24-hour idle lease; active commands prevent expiry. The worker checks expiry every minute and
on incoming calls/startup, persists the last-use time, and revokes expired tokens without touching
the user's chat or files. Tool discovery does not renew the lease. Expired URLs return 404;
the inactive plugin entry may remain in ChatGPT, but grants no access. Replies stay in ChatGPT.
Do not wait or collect. Existing token-based open sessions remain usable until they expire.
