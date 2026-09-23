# Worker service PATH repair — 2026-09-23

The previous fresh launchd installation omitted PATH and WebGPT had to repair it inside a task. Updated setup.md now requires persisting the verified installation PATH in the Worker service, preserving order and including resolved Node/npm executable directories. It avoids platform-path assumptions and per-task shell startup sourcing. The existing setup smoke now checks node/npm inside the actual Worker environment.

The source and installed setup reference were synchronized. A fresh gpt-6-sol / low CLI session followed the updated instructions, changed the idle Worker service environment, restarted only the Worker and delegated one exact command in Chat: `node --version && npm --version && npm test`. The assignment disallowed PATH overrides, absolute executable paths and retrying a failed command.

The saved result reports v26.5.0, 11.17.0, WORKER_PATH_OK and exit 0. The result artifact hash was independently checked; task completed, collected and nextCheck=null. The helper returned deleted_and_closed. setup.json records the environment verification. The tunnel service file/state, Worker config and connector registration ID were unchanged.

Skill validation and git diff --check passed. This is a service/documentation change; terminal runtime code was not modified and the unrelated 146-test suite was not repeated. No new accounts or user setup steps were added, and no parent intervention was needed during the CLI run. Worker commands inherit the configured service environment for both PTY and pipe execution. Per-command transport auditing was not enabled; command output is the saved WebGPT report, with independent artifact integrity verification.

Old account-side connector definitions remain a separate unresolved limitation; this repair does not delete them.
