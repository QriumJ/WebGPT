# Final-skill bounded-module retest — 2026-09-23

The current skill was frozen and retested through actual Codex CLI **gpt-5.6-sol / low**, using the same range-set fixture and independent evaluator. The implementation passed **13/13 independent cases**; WebGPT reported 8/8 own tests. The controller collected the saved result and deleted/closed the owned Chat without a parent recovery instruction. The existing connector and services were reused and retained; Plugins setup was not reopened.

| Measurement | Historical direct baseline | Previous delegation | Current delegation |
| --- | ---: | ---: | ---: |
| Independent acceptance | 13/13 | 13/13 | 13/13 |
| Total input | 174,966 | 1,329,867 | 768,937 |
| Cached input | 134,144 | 1,240,192 | 723,072 |
| Uncached input | 40,822 | 89,675 | 45,865 |
| Output | 4,148 | 5,259 | 4,123 |
| Completed tool operations | 11 | 24 | 19 |
| Additional parent instructions | 1 repair | 1 cleanup | 0 |

Compared with the previous delegation, uncached input decreased **48.9%**, total input **42.2%**, and output **21.6%**. Compared with direct implementation, uncached input was still **12.4% higher**, total input **4.39×**, and output **0.6% lower**. These counters do not establish Codex quota savings. The historical direct baseline includes its sparse-array repair and was not rerun. Cache state, rendering, generation timing and cleanup behavior were not controlled; changes cannot be assigned a causal percentage from one sample.

The final native-menu/reply-observation helper was present, but the controller used three grounded manual permission/check calls instead of `recoverPermission`. It also called `finish` again before acknowledging the due check, then read recovery instructions and continued. Initial dispatch returned `submission_unconfirmed`; one read-only inspection verified the existing submitted user turn, without resend. These costs remain in the measurements. Helper availability is not evidence that a low-reasoning controller will always select it.

The result's final test evidence was sufficient, so the controller did not rerun the passing suite. The parent ran only the frozen independent acceptance evaluator, as required by this comparison. The original fixture and evaluator hashes remained unchanged. No implementation takeover, connector replacement, Work execution or service restart was used. The final skill snapshot and actual helper outcomes are in the accompanying metrics; raw logs and credentials remain private.

## Cleanup-policy finding for the next improvement

A targeted read of the earlier fresh-reuse tool documentation found an explicit **Computer Use Confirmations Policy** section titled **“Always Confirm at Action-Time (Even If Pre-Approved)”**. It requires blocking confirmation immediately before deletion of cloud/local data. Thus the previous CLI stops had an explicit documentation basis, rather than only a vague model inference; no actual tool rejection was recorded before those stops. The current retest completed the already-authorized cleanup without that stop, demonstrating variability rather than eliminating the conflict.

A reliable default cannot promise both permanent deletion and no confirmation in every runtime. The user subsequently chose to **keep permanent deletion**. The next stage preserves that choice and prepares exact deletion targets before any mandatory confirmation, rather than changing retention defaults. Explicit user retention/deletion preferences remain primary. No retention default was changed during this cost retest.
