# TEMBUS project instructions

Repo: `E:\TEMBUS LINTAS TEKNOLOGI\TEMPLATE WEB MARKETPLACE`

This file applies to this repo and refines the global `AGENTS.md`. Where the two conflict, this file wins.

## Business context

TEMBUS is the delivery system. Every shipment runs on it, from on-demand delivery through aggregator integration. Use this context when naming modules, writing docs, or deciding whether a feature belongs in scope. Do not invent delivery flows that have not been specified by the user.

## Repo layout

```text
brand-store-app/    backend API (Hono + TypeScript + Drizzle + PostgreSQL)
brand-store-prd/    PRD v2.0.0
TASK-CHECKLIST.md   per-item status
VERIFY-LOG.md       command output evidence
AUDIT-REPORT.md     code audit + smoke test
docker-compose.yml  api, postgres, redis, minio
```

## Frozen graphify locations

Confirmed on 2026-11-12:

- App folder owning the graph: `brand-store-app`
- Graph state: `brand-store-app\.engram\graph.json`
- Obsidian vault: `E:\antigraviti google\SUDAH DEPLOY\vault` (the path registered in `%APPDATA%\obsidian\obsidian.json`)
- Vault notes: `01 Projects\TEMBUS\`
- Project index: `01 Projects\TEMBUS\00 Index TEMBUS.md`
- Generated mirror: `03 Resources\Graphify\brand-store-app\`
- Binary: `engram` (v0.19.1). `graphify` is accepted as a deprecated alias. Set `ENGRAM_QUIET_DEPRECATION=1` to silence the notice.

Do not mirror into any other vault. Treat everything under `03 Resources\Graphify\brand-store-app\` as generated output and never hand-edit it.

## Commands

```powershell
cd "E:\TEMBUS LINTAS TEKNOLOGI\TEMPLATE WEB MARKETPLACE\brand-store-app"
$env:ENGRAM_QUIET_DEPRECATION="1"
graphify update --no-description --no-label
graphify export obsidian --dir "E:\antigraviti google\SUDAH DEPLOY\vault\03 Resources\Graphify\brand-store-app"
```

## Vault note naming

`<TASK-ID> - <Judul Singkat> (YYYY-MM-DD).md` inside `01 Projects\TEMBUS\`. Then append one row to `00 Index TEMBUS.md`:

```markdown
| YYYY-MM-DD | TASK-ID | Judul | Status | [[TASK-ID - Judul Singkat (YYYY-MM-DD)]] |
```

## Evidence gate

```powershell
Get-Item "E:\TEMBUS LINTAS TEKNOLOGI\TEMPLATE WEB MARKETPLACE\brand-store-app\.engram\graph.json" | Select-Object FullName, Length, LastWriteTime
Get-ChildItem "E:\antigraviti google\SUDAH DEPLOY\vault\01 Projects\TEMBUS" -Filter *.md | Select-Object Name, LastWriteTime
```

## Close-out

Update `TASK-CHECKLIST.md` and `VERIFY-LOG.md` in the same turn as the code change, then run the graph refresh, the vault mirror, and the note. No em dash in any note.
