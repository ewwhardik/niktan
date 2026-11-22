# NikTan (निकतन)

> **तबियत कइसन हे? तीन मिनट म जाँच लव.** — *How's your health? Check it in three minutes.*

NikTan turns a phone into the first checkup. A citizen does a 3-minute browser-based screening
(face heart rate, eye pallor, vision, hearing, spoken symptoms) and gets a triage priority and a
department **before** reaching the OPD. The hospital sees them on a live triage board, and the doctor
opens a pre-filled pre-consult card instead of spending the 5-minute consult on basics.

Built for **Hackasol 5.0 · Track 1 Open Innovation (OI-01)**.

**NikTan screens and prioritises. It never diagnoses.**

## Modules

| Module | What it does |
|---|---|
| **NikTan Scan** | Face vitals (rPPG), eye scan, vision test, hearing test, symptoms by voice |
| **NikTan Thali** | Meal photo → nutrition totals → local food swaps |
| **NikTan OPD** | Live hospital triage board, doctor pre-consult card, admin dashboard |

## Repository layout

```
apps/web        React PWA (citizen + hospital UI)
apps/api        Cloudflare Worker API (Hono + D1)
packages/core   Pure TypeScript: triage engine, symptom vocabulary, nutrition, schemas
```

## Getting started

```bash
pnpm install
pnpm test
pnpm dev:api   # http://localhost:8787
pnpm dev:web   # http://localhost:5173
```
