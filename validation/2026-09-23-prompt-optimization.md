# Skill instruction and assignment optimization — 2026-09-23

## Applied changes

The normal instruction path fell from 1,555 to 985 whitespace-delimited English words (36.7%). SKILL.md fell from 1,156 to 724, and workspace.md from 399 to 261. Conditional same-chat follow-ups and notification-only waiting moved to recovery.md. Removed duplicated cleanup/permission explanations while preserving explicit permanent deletion authorization, Chat-only operation, Always allow, user workflow precedence, English coordination and requested user-facing language.

The skill description now scopes shorthand triggers to WebGPT requests. Assignments should reference accessible project briefs rather than restating them; Worker tokens/save requirements explicitly apply only to Worker-backed work. Final instructions forbid rereading returned artifacts or rerunning already-supported passing tests absent concrete evidence gaps or user requirements. The README Install prompt retains its authorizations with less repetition; its broad first usage example was replaced with one bounded deliverable.

Source and installed skill were synchronized. A separate review identified and corrected browser-only scoping and requested reply-language ambiguities before live candidate testing. Skill validation and git diff --check passed. No helper/runtime code changed, so the unrelated unit suite was not rerun.

## Controlled live trials

Each variant used a fresh `gpt-6-sol / low` Codex CLI session, the same English user request and identical initial normalizeTags project fixtures. Existing Worker/connector/PATH configuration was reused; the parent delivered no extra prompts or UI assistance during any run. All three runs used Chat/xh, submitted once, delivered correct implementation plus three passing tests, saved/verified/collected results and permanently deleted/closed their task conversation. Final tab inventory contained only the pre-existing user's ChatGPT tab.

| Metric | Baseline | First compression | Final compression |
| --- | ---: | ---: | ---: |
| Completed tool operations | 15 | 14 | 18 |
| Uncached input tokens | 41,819 | 30,208 | 39,295 |
| Output tokens | 2,220 | 1,495 | 1,680 |
| Session seconds | 177.831 | 131.624 | 143.305 |
| Assignment characters | 514 | 620 | 473 |
| Assignment words | 64 | 82 | 62 |

The first compression retained function but redundantly restated the brief, reread its returned artifact and reran already-reported passing tests. The final adjustment referenced README.md, reduced assignment length and eliminated the duplicate artifact read/test run in that sample.

## Limits and remaining preparation cost

The final run still unnecessarily read configuration, searched setup.md, listed files and searched for setup.json despite the documented identity path. This explains why instruction/assignment reductions did not yield fewer total tool calls in the final sample. The result demonstrates smaller instructions and improved sampled assignment/review behavior, not universally optimal behavior or an established Codex account-quota saving.

Only one run per variant was performed, sequentially. Browser state, cache reuse, model choices and WebGPT latency confound usage/timing comparisons. Do not selectively report the first candidate's lower usage as the final version's result. Word counts are not token counts. The shortened README Install prompt was reviewed for preserved authorization but was not subjected to another full uninstall/reinstall cycle. Browser-only/open/same-chat branches received instruction review, not new end-to-end tests in this optimization pass.

Per-command Worker transport auditing was not enabled. Saved results and delivered files provide execution evidence; artifact hashes and collection/deletion outcomes were independently checked. Sanitized per-trial audits and fixtures accompany this report; raw credential-bearing CLI logs remain private outside the repository.
