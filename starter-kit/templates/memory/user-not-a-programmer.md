---
name: user-not-a-programmer
description: "The user is not a programmer; explain setup in plain Ukrainian, one click/step at a time, and do technical steps myself where possible"
metadata:
  node_type: memory
  type: user
  originSessionId: aa7a8e24-a0b5-421e-8b6a-90f56f82f1a8
  modified: 2026-11-18T12:47:59.760Z
---

The user says they do not understand programming or coding (2026-11-18). They work in the Claude desktop app (Code tab) on Windows and write in Ukrainian.

**Why:** a terminal command I gave ("claude mcp add ...") failed for them: they ran it in PowerShell where the `claude` CLI is not installed, and they did not know where commands go.

**How to apply:** never hand over raw commands with placeholders. Say exactly where to click and what to type, one step at a time, and say what they should see after each step. Do terminal/config work myself (with their OK) instead of asking them to run it. Prefer double-click launchers (.bat) over commands. Related: [[feedback-continue-without-stops]]
