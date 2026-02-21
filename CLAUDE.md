# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm start        # Start production server
```

There are no configured lint or test scripts. Use `npx tsc --noEmit` to type-check without building.

TypeScript path alias: `@/*` → `./src/*`

## Architecture

This is a **doctor shift scheduling SaaS** built with Next.js 14 App Router + Supabase.

### Request Flow

1. `src/middleware.ts` — refreshes Supabase session on every request
2. `src/app/dashboard/page.tsx` — protected route; renders `<SchedulingDashboard />`
3. `src/components/scheduling/scheduling-dashboard.tsx` — main orchestrator; loads all data from Supabase (doctors, teams, shifts, leave days) and renders the four-tab UI

### Scheduling System (Core Domain)

The two most important files in the codebase:

**`src/lib/scheduling-engine.ts`** — Pure algorithmic engine. Generates a full monthly schedule given doctors, teams, and leave days. Key constants and rules:
- 12-hour shifts: day (08:00–20:00), night (20:00–08:00)
- 24h mandatory rest after day shifts, 48h after night shifts
- Max 48h/week per doctor
- Teams rotate by their `order` field; floating doctors fill gaps
- Within a team, doctors with fewer shifts are prioritized (equalization)
- Returns `{ shifts, conflicts, stats }` — never writes to DB directly

**`src/components/scheduling/shift-grid-calendar.tsx`** — Grid calendar where rows = doctors, columns = days. Calls `SchedulingEngine`, displays results, and allows manual edits. Tracks remaining leave days with validation.

### Other Scheduling Components

| File | Role |
|------|------|
| `configuration-panel.tsx` | CRUD for teams and doctors via Supabase |
| `doctor-view.tsx` | Per-doctor schedule filtered from the grid |
| `summary-dashboard.tsx` | Coverage stats, conflict alerts, quick-start guide |
| `monthly-calendar.tsx` | Alternative calendar view |

### Data Model (`src/types/scheduling.ts`)

- **Doctor** — `name, team_id, is_floating, preferences`
- **Team** — `name, color, max_members, order` (order controls rotation priority)
- **Shift** — `doctor_id, shift_date, shift_type ('day'|'night'|'rest')`
- **LeaveDay** — `doctor_id, leave_date`
- **ScheduleConflict** — `type ('rest_violation'|'understaffed'|'overstaffed'), date, doctor_id, message`

### Auth & Database

- Supabase handles both auth and PostgreSQL
- Server-side client: `src/utils/auth.ts`
- Client-side usage: directly in components via `@supabase/supabase-js`
- Auth group layout: `src/app/(auth)/` (sign-in, sign-up, forgot-password)
- OAuth callback: `src/app/auth/callback/`

### UI Stack

- **shadcn/ui** components live in `src/components/ui/` — do not modify these directly; regenerate via `npx shadcn-ui add <component>`
- **Tailwind CSS** with class-based dark mode; colors are HSL CSS variables defined in the global stylesheet
- **Lucide React** for all icons
- `src/app/tempobook/` — Tempo DevTools storyboards for component development; not production code
