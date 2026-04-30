# Documentation Style Guide

## Naming

- Use consistent mode names:
  - Standalone (MSW Simulation)
  - Backend Mode
- Use uppercase for environment variables: `CORS_ALLOWED_ORIGINS`, `NODE_ENV`

## Terminology

- Prefer “audit log / event log” instead of “log” when meaning historical accountability
- Prefer “settlement/dispute” when referring to L3 actions, not “payment” or “punishment” alone

## Links

- Use relative links (`./path/to/doc.md`) so GitHub renders them correctly
- Avoid `file:///` links (blocked by docs:check)
- Link glossary terms once on first mention in a page (then keep later mentions plain)
- For roadmap pointers, prefer linking to code with `#Lx-Ly` line ranges

## Code blocks

- Always specify language tags: `bash`, `yaml`, `ts`, `js`
- Commands should be copy/paste friendly (no shell prompts)
