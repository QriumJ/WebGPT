# Implement an event-log summary library and CLI

Complete `src/summary.mjs` and `src/cli.mjs`, add useful tests, and document usage in README.md. Use Node built-ins only. Preserve the public API and existing tests. Do not modify this task specification.

`summarize(text, {from, to} = {})` accepts NDJSON text. Ignore blank lines and support LF/CRLF. Each nonblank line must be a JSON object with nonempty string `id` and `service`, a `ts` string in ISO datetime syntax including a timezone (`Z` or ±HH:MM) and a valid calendar date, a finite nonnegative numeric `durationMs`, and integer `status` from 100 through 599. Reject arrays/null and wrong field types. Extra fields are allowed. Errors must include the physical 1-based line number. Validate every record, even if it will be filtered or deduplicated.

Keep the first valid occurrence of each id, then apply the optional timestamp range (`from` inclusive, `to` exclusive). Range values use the same timestamp validation; invalid or reversed ranges throw an error. Equal bounds yield no events. Compare timestamps as instants, not strings.

Return `{count, services, days}`. `services` is sorted lexicographically by service and contains `{service,count,errors,totalMs,meanMs,p95Ms}`. Errors are statuses >=500. Do not round numeric aggregates. p95 is nearest-rank percentile: sorted durations at `ceil(0.95 * count)-1`. `days` is sorted UTC calendar day and contains `{day,count}`. Empty input returns `{count:0,services:[],days:[]}`. Do not mutate caller options.

CLI: `node src/cli.mjs [--from ISO] [--to ISO] [FILE|-]`. Default input is stdin. Read .gz files through gzip decompression. Print one JSON result plus newline to stdout on success, exit 0. Unknown/duplicate options, missing option values, multiple files, invalid input, read failures and gzip errors must print a concise error to stderr, no stdout or stack trace, and exit 2. File paths starting with '-' are out of scope. Add tests for meaningful edge cases and run them. Report changes and actual test results concisely.
