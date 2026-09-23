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

### Delegate a task

Tell Codex:

```text
webgpt h Implement and test CSV export.
```

| Mode | Level |
| --- | --- |
| `m` | Medium |
| `h` | High |
| `xh` | Extra High (default) |
| `p` | Pro |

### Work directly in ChatGPT

Tell Codex:

```text
webgpt open
```

Opens ChatGPT with terminal access to the current project.
For another project, use `webgpt open /path/to/project`.
