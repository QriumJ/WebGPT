# Registration-provided connector identity — 2026-09-23

## Change

Successful non-open client registrations now include `connection: {status: "ready", name, registrationId}` using validated selection metadata from setup.json beside the selected config. Only the two identity fields are returned; URLs, setup contents and credentials are not added. Existing setup aliases are supported and bare asdk_app IDs normalized. No extra network request is made.

Missing, invalid, unreadable or oversized optional metadata yields a nonfatal missing/invalid status after successful registration. It never causes another mutation. Explicit config objects without a profile path do not read the user's real profile. Open registrations and other actions are unchanged. setup identity is a local hint, not a remote health guarantee. Chat launch URLs are deliberately omitted; current setup had no verified launch URL, and exact connector selection remains supported.

The skill instructs normal work to register first and use its returned identity without config/setup reads, directory searches or Plugins rediscovery. Recovery retains the already-registered task when metadata needs repair. Updated source and installed copies match; neither Worker nor tunnel restart was needed.

## Verification

Full suite: 152 passed, 0 failed. Six new tests cover aliases, custom profile selection, missing/invalid metadata, bounded reads, secret exclusion, nonfatal single registration and open isolation; existing forwarding tests also pass. Skill validator and git diff --check pass. Independent review found no code regression; nested field notation was clarified in the documentation.

A fresh gpt-6-sol / low CLI session received exactly the same normal user request and initial normalizeTags task as the prior instruction-compression experiment. No harness reminder to skip settings or parent intervention was supplied. It used ready metadata matching the existing connector, Chat/xh, one register/dispatch/finish, verified collection and permanent deleted_and_closed cleanup.

Audit found zero configuration/setup/helper-source reads or directory searches for connector identity. No duplicate artifact read or test rerun occurred inside the CLI. Independent project tests passed 2/2 and acceptance checks covered empty/frozen/Unicode and invalid inputs. Worker state is completed/collected, backup deadline cleared and artifact hash independently matched. Final browser inventory contained only the pre-existing user ChatGPT tab. Tunnel state, Worker service file and saved connector ID remained unchanged.

## Observed cost

| Metric | Previous final compression | Registration identity |
| --- | ---: | ---: |
| Completed tool calls | 18 | 15 |
| Uncached input tokens | 39,295 | 25,939 |
| Output tokens | 1,680 | 1,784 |
| Session seconds | 143.305 | 171.484 |
| Assignment characters | 473 | 407 |
| Assignment words | 62 | 52 |

The targeted unnecessary settings exploration disappeared in this sample. Latency increased, demonstrating that fewer calls/input tokens do not imply faster WebGPT generation. Single sequential samples, cache state and model variability prevent attributing an account-quota reduction or proving universal repeatability. Incidental absent-AGENTS and non-Git-fixture checks remain outside connector discovery. Per-command Worker audit was not enabled; saved result evidence and independent artifact/tests support the outcome.
