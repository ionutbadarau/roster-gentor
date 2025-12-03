# Doctor Shift Planning Application

A Next.js-based shift scheduling system for medical staff, featuring automated monthly calendar generation with 12-hour day/night rotations.

## Quick Start

1. Install dependencies: `npm install`
2. Set up environment variables (see `.env.example`)
3. Run migrations: `npx supabase db push`
4. Start development server: `npm run dev`

## Features

- **Automated Scheduling**: Generate monthly schedules with team-based rotation
- **Rest Period Enforcement**: 24h rest after day shifts, 48h after night shifts
- **Team Management**: Organize doctors into teams with configurable rotation order
- **Floating Staff**: Support for floating doctors to fill coverage gaps
- **Hour Equalization**: Balances workload across all doctors
- **Conflict Detection**: Identifies understaffing and rest violations

## Documentation

See [SHIFT_SCHEDULING_README.md](./SHIFT_SCHEDULING_README.md) for detailed documentation.

## Tech Stack

- Next.js 14 (App Router)
- Supabase (PostgreSQL)
- shadcn/ui + Tailwind CSS
- TypeScript
