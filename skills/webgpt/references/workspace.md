# Worker delegation

The Worker exposes `exec_command`, `write_stdin`, `get_task`, `read_input` and `submit_result`.
Its schemas supply the protocol; do not repeat them in assignments.

Terminal access is the Worker user's full OS access; project cwd is **not a sandbox**. No root or
OS privacy bypass is granted. Read-only instructions are behavioral; never silently upgrade a
file-only grant. Tokens separate cooperative tasks, not hostile users. Preserve project rules and
others' changes; do not expose the Worker to untrusted users.

```sh
node <skill>/scripts/client.mjs register --cwd /absolute/project
```

The response includes task ID/token and `connection: {status: "ready", name, registrationId}`.
Use this identity to select the existing connector in Chat; no separate setup/config lookup is needed.
No connection URL or controller key is added. `missing`/`invalid` metadata does not undo registration:
keep this task and resolve identity via [recovery.md](recovery.md), without registering it again.

Send the returned token with the assignment; no task document is required. Default backup check:
20 minutes. Use `--backup-ms <positive-ms>` for a requested interval; no separate timer or progress
reports. JSON/API supports optional `instructions` and named `inputs`; omitting `terminal` allows
text-only tasks, which still require the connector to save results.

```sh
node <skill>/scripts/client.mjs finish <id> [id ...]
```

Waits only for these IDs and returns saved result text with verified integrity and collection,
or actionable `backupDue` / `recoveryRequired` / `settled:true`. Hash mismatch prevents collection;
backup/recovery returns do not collect. Collection revokes task access; saved results survive restart.
Remove collected IDs from waits. Follow [recovery.md](recovery.md) for exceptions.

For separately assigned concurrent work, use one `status <ids>` at integration time, not periodic
polling. Advanced notification-only waiting is documented in recovery.md.

HTTP yields do not stop commands. Sessions end on exit, task completion/cancellation or Worker
shutdown; they do not survive restart. No automatic undo, revision checking, command allowlist,
output truncation or command timeout. The Worker never deletes chats; shell access does not imply
computer-control access. Use [open.md](open.md) for user-controlled sessions.
