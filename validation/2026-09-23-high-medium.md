# High and Medium modes — 2026-09-23

Added `h/high` and `m/medium`, retaining `xh/xhigh` (default) and `p/pro`. Updated skill discovery, mode instructions, setup wording, README, browser normalization and transition tests. Installed skill synchronized.

Live validation exposed unreliable clicks on the performance slider/instruction text. The final helper uses observed keyboard focus (at most two Down keys), verifies Performance focus, then chooses Left/Right based on the observed current rank. It refuses to type when mode or focus cannot be verified.

## Validation

- Final full suite: 157 passed, 0 failed. Skill validator and diff whitespace checks passed.
- Fresh Codex CLI session: `gpt-6-sol`, `model_reasoning_effort=low`; session metadata verified. Thread: `01a0cce6-e2fc-76c2-9724-898e3e5d0870`.
- Browser-only smoke used a separate new Chat tab per mode, no Worker/setup/Plugins discovery.
- `h`: observed `High`, first dispatch submitted, exact `HIGH_MODE_OK` reply; `deleted_and_closed`.
- `m`: observed `중간`, first dispatch submitted, exact `MEDIUM_MODE_OK` reply; `deleted_and_closed`.
- Long aliases covered by automated dispatch/send tests; live smoke used short aliases.

The earlier candidate had one browser transport timeout during High (recovered only after confirming no submission) and returned `needs_mode` for Medium. That evidence led to the keyboard focus fix; it is not counted as a successful final run. Its High conversation was deleted and the unsent Medium tab was closed. Parent diagnostic tabs sent no messages and were closed. Existing user tabs were preserved.

This validates these mode transitions and cleanup on the observed UI; it does not establish immunity to future UI changes or measure usage-limit savings. Machine-readable final evidence: `2026-09-23-high-medium.json`.
