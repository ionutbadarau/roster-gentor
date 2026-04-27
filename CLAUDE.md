# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Post-Change Cleanup

After any deletion or removal of components, pages, modules, or significant code:

1. **Orphaned files** — grep for imports of the removed item; if nothing imports it, delete it. Recurse (a deleted file may have been the sole consumer of another).
2. **Translation keys** — remove unused keys from both `src/lib/i18n/en.json` and `src/lib/i18n/ro.json`.
3. **Navigation / routes** — remove links, tabs, or redirects pointing to deleted pages.
4. **Documentation** — update architecture tables and references in this file.
5. **Type-check** — run `npx tsc --noEmit` to confirm nothing is broken.

Do all of this as part of the same change, without being asked.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm start        # Start production server
```

Unit tests use **Vitest**: run with `npx vitest` (watch mode) or `npx vitest run` (single run). Use `npx tsc --noEmit` to type-check without building.

TypeScript path alias: `@/*` → `./src/*`

## Architecture

This is a **doctor shift scheduling SaaS** built with Next.js 14 App Router + Supabase.

### Request Flow

1. `src/middleware.ts` — refreshes Supabase session on every request
2. `src/app/dashboard/page.tsx` — protected route; renders `<SchedulingDashboard />`
3. `src/components/scheduling/scheduling-dashboard.tsx` — main orchestrator; loads all data from Supabase (doctors, teams, shifts, leave days) and renders the four-tab UI

### Scheduling System (Core Domain)

The scheduling engine lives in **`src/lib/scheduling/`** (re-exported from `src/lib/scheduling-engine.ts` for backward compatibility). It uses a cadence-first algorithm. See [`src/lib/scheduling/ALGORITHM.md`](src/lib/scheduling/ALGORITHM.md) for the algorithm description, data flow, and tuning parameters.

**Module structure:**

| File | Responsibility |
|------|---------------|
| `scheduling-engine.ts` | Cadence-first engine: constructor, `generateSchedule()`, static method delegates |
| `constants.ts` | `SCHEDULING_CONSTANTS`, `ScheduleGenerationOptions`, `EngineContext` interface |
| `calendar-utils.ts` | Pure date/time helpers: `formatDate`, `utcMs`, `getDaysInMonth`, etc. |
| `bridge-days.ts` | Bridge day computation (weekends/holidays between leave periods) |
| `constraints.ts` | `canDoctorWork`, `canDoctorWorkWithTimeline` — all constraint checking |
| `stats.ts` | Shift recording, counter management, per-doctor statistics |
| `validation.ts` | Static utilities: `detectConflicts`, `validateLeaveDays`, `computeUnderstaffedDays` |
| `equalize-shifts.ts` | Post-generation shift equalization: swaps shifts between EQZB doctors to balance "+/- Norm" deltas |

**Key rules:**

- 12-hour shifts: day (08:00–20:00), night (20:00–08:00)
- 24h mandatory rest after day shifts, 48h after night shifts
- Max 48h/week per doctor
- The min nr of working hours each doctor needs to have each month is 7h \* nr of working days for that month
- Teams rotate by their `order` field; floating doctors fill gaps
- Cadence-first: D-N-R-R per team, staggered by order; gap-filling with norm rebalancing
- Force-fill guarantee: a final phase assigns lowest-norm doctors to any remaining understaffed slots regardless of rest constraints, ensuring zero understaffed days after generation (excludes constrained-team and optional doctors)
- Returns `{ shifts, conflicts, warnings, doctorStats }` — never writes to DB directly

**`src/components/scheduling/shift-grid-calendar.tsx`** — Grid calendar where rows = doctors, columns = days. Calls `SchedulingEngine`, displays results, and allows manual edits. Tracks remaining leave days with validation.

### Other Scheduling Components

| File                      | Role                                               |
| ------------------------- | -------------------------------------------------- |
| `configuration-panel.tsx` | CRUD for teams and doctors via Supabase            |
| `monthly-calendar.tsx`    | Alternative calendar view                          |

### Data Model (`src/types/scheduling.ts`)

- **Doctor** — `name, team_id, is_floating, preferences`
- **Team** — `name, color, max_members, order` (order controls rotation priority)
- **Shift** — `doctor_id, shift_date, shift_type ('day'|'night'|'rest')`
- **LeaveDay** — `doctor_id, leave_date`
- **ScheduleConflict** — `type ('rest_violation'|'understaffed'|'overstaffed'), date, doctor_id, message`

### Subscriptions / Billing

Stripe-backed gating with 90-day trial. See [`src/lib/SUBSCRIPTIONS.md`](src/lib/SUBSCRIPTIONS.md) for full state machine, files, webhook events, and env vars.

### Account Deletion

`/account` page (top-level, outside `(dashboard)` group to bypass the subscription gate so canceled users can still delete) → `POST /api/account/delete`. Route order: cancel Stripe subscription → delete Stripe customer → send goodbye email via Resend → delete `public.users` row → `supabaseAdmin.auth.admin.deleteUser`. The `auth.users` deletion cascades to `subscriptions`, `doctors`, `teams`, `national_holidays`, `schedule_config`, `schedule_share_tokens`; `shifts` and `leave_days` cascade transitively via `doctors`. Confirmation requires the user to type their own email. After success the client signs out and redirects to `/?deleted=1`, where `<AccountDeletedToast />` shows a one-shot banner.

### Auth & Database

- Supabase handles both auth and PostgreSQL
- Server-side client: `src/utils/auth.ts`
- Client-side usage: directly in components via `@supabase/supabase-js`
- Auth group layout: `src/app/(auth)/` (sign-in, sign-up, forgot-password)
- OAuth callback: `src/app/auth/callback/`

### Internationalization

Translation files: `src/lib/i18n/en.json` (English) and `src/lib/i18n/ro.json` (Romanian).
Keys are nested by feature area (e.g. `scheduling.config.teamName`). Always update both files when adding/removing keys.

### UI Stack

- **shadcn/ui** components live in `src/components/ui/` — do not modify these directly; regenerate via `npx shadcn-ui add <component>`
- **Tailwind CSS** with class-based dark mode; colors are HSL CSS variables defined in the global stylesheet
- **Lucide React** for all icons
- `src/app/tempobook/` — Tempo DevTools storyboards for component development; not production code
