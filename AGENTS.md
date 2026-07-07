# AI Agent Project Rules (dockerstackcronjob)

These rules are mandatory for ANY AI Agent (Codex, Claude Code, Antigravity, Cursor, etc.) working in this project.

## 1) Always update `.git/vstool-commit-template.txt`

- Summarize only the changes made in the session that have NOT been committed yet. Do NOT include changes from previous commits that have already been finalized.
- Write the commit summary directly to `.git/vstool-commit-template.txt`. Do NOT commit the changes; let the user review and commit them manually.

## 2) Message format

Use conversational summary content (not commit-style), aligned with what the AI Agent says to the user.

Required structure in `.opushforce.message`:

1. Opening line confirming rule-following, for example:
   `feat:<tóm tắt nội dung>` and/or `fix:<tóm tắt nội dung>`
2. Section: `Input của user`
3. Section: `Nguyên nhân gốc`
4. Section: `Cách đã chỉnh để khắc phục`
5. Section: `File đã áp fix bug`
6. Section: `Trả lời câu hỏi "<câu hỏi chính của user>"`
7. If runtime action is needed, include exact command(s) at the end.

Formatting rules:

- Write in Vietnamese, concise and clear.
- Prefer short lines or flat bullets; no nested bullets.
- In `Input của user`, include the user's original request text; if too long, keep a concise excerpt that preserves key constraints.
- If user input contains secrets/tokens, mask sensitive values.
- File list can be plain filenames or paths.
- Do not use `<type>: <summary>` commit prefix.

## 3) Completion gate

The AI Agent should treat the task as incomplete until `.opushforce.message` is updated (write or append) to reflect the latest work.
