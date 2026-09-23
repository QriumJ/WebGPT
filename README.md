# WebGPT

<img width="871" height="40" alt="image" src="https://github.com/user-attachments/assets/97d758f5-4666-4d21-9cc0-68a3f0fbcc88" />

**Save your Codex quota.** A Codex skill that offloads work to ChatGPT on the web.

## Install

Paste this into Codex:

```text
Install https://github.com/Nhahan/WebGPT/tree/main/skills/webgpt
Follow references/setup.md; install, configure and verify everything yourself.
I authorize the local Worker, accountless HTTPS forwarding, sharing its private URL
with my signed-in ChatGPT, and full terminal access as my OS user for assigned projects
(the project folder is not a sandbox).
Choose Always allow for WebGPT permission prompts. Run the setup test, permanently
delete its chats and close its tabs. Do not ask again for these approved actions.
Ask only for sign-in or another genuinely user-only step, then continue.
Do not require a new tunnel account or domain.
```

## Use

### Delegate with Codex — `xh` / `h` / `m` / `p`

Codex sends the task to WebGPT and collects the result. Tell Codex:

```text
Use webgpt xh to implement and test the CSV export described in this project's issue.
```

```text
webgpt p Research this topic and summarize the findings.
```

`xh` = Extra High (default) · `h` = High · `m` = Medium · `p` = Pro.
Long aliases: `xhigh`, `high`, `medium`, `pro`. Medium may appear as Standard/표준 in the UI.

Your requested workflow takes priority. For example:

```text
Use webgpt xh to implement and test the API. While it works, you implement the UI.
```

Without other instructions, Codex delegates a bounded task with its tests, waits quietly,
and reviews the saved result once. Partial results preserve completed work for continuation.
You can request progress checks, same-chat follow-ups, or keeping the task chat.

### Use ChatGPT yourself — `open`

Open the current project:

```text
webgpt open
```

Or specify another project:

```text
webgpt open /path/to/project
```

Open a blank ChatGPT tab connected to your project's terminal. You start the conversation,
run the work and close the chat; Codex only sets up the connection.
Terminal access expires after 24 hours without use; each use resets the timer.
