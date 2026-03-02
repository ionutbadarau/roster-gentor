# Scheduling Algorithm

## Problem Statement

Generate a monthly schedule assigning doctors to 12-hour shifts (day 08:00–20:00, night 20:00–08:00) while satisfying hard constraints and optimizing soft goals.

### Hard Constraints
- **Rest periods**: 24h after day shifts, 48h after night shifts, 72h after 24h shifts
- **Weekly limit**: max 48h per doctor per week
- **Leave/bridge days**: no shifts on leave days or bridge days (weekends/holidays between leave periods)
- **Slot coverage**: each day must have `shiftsPerDay` day-shift doctors and `shiftsPerNight` night-shift doctors

### Soft Goals
- **Base norm**: each doctor should work ≥ 7h × working days (reduced by 12h per leave day)
- **Equalization**: distribute shifts evenly across doctors
- **Team cohesion**: prefer same-team doctors on the same day when possible
- **Day→night continuation**: prefer assigning night shifts to doctors who worked the preceding day shift

## Algorithm: Greedy + Repair

### Phase 1: Greedy Forward Assignment

Iterates day-by-day (day 1 → day N), assigning doctors to each slot:

```
for each day:
  register fixed (manual) shifts
  for each shift type (day, night):
    slots_needed = required - fixed_count
    selected = selectDoctorsForShift(slots_needed)
    record each selected shift
```

#### Doctor Selection Heuristic (`doctor-selection.ts`)

For each candidate doctor, compute a **priority score**:

```
score = paceGap - lookaheadPenalty + continuationBonus
```

- **paceGap** = `(target × elapsedAvailDays / totalAvailDays) - currentShifts`
  - Positive = behind schedule, negative = ahead
  - Doctors with upcoming leave fall behind faster → get prioritized
- **lookaheadPenalty** = penalty if this doctor's rest would block a tight future day (checked 1-3 days ahead)
- **continuationBonus** = +10 if this is a night shift and the doctor worked yesterday's day shift

Selection uses a **hard partition**: under-target doctors always come before met-target doctors. Within each group, sorted by score descending.

**Team cohesion**: After picking slot 1 (highest priority), subsequent slots prefer same-team doctors if their paceGap is within 1.5 of the best candidate.

### Phase 2: Repair (Three-Stage)

If the greedy pass leaves unfilled slots (due to rest constraint cascading), the repair phase attempts to fill them. Skipped entirely if too few doctors for the required slots or >15% of total slots are unfilled (structural understaffing).

All repair constraint checks use **date-based distances** matching `detectConflicts` semantics: `hoursBetween = |midnight(dateA) − midnight(dateB)| / 3600000`. This avoids a mismatch between the repair checker and the validator.

#### Stage 1: Small-Window Backtracking

For each unfilled slot, try windowed backtracking with radius 2→3:

1. Remove all generated shifts in the window
2. Re-solve via depth-first search with MRV (minimum remaining values) slot ordering
3. Checks constraints via `canDoctorWorkWithTimeline` (explicit shift list, not mutable state)
4. Limited to 5,000 nodes and 30 slots per window

#### Stage 2: Swap-Based Repair

For each remaining unfilled slot, find a doctor blocked only by a rest constraint from an adjacent shift, then try to reassign that blocking shift to another doctor — freeing the original doctor for the gap.

1. Build per-doctor shift index and pre-compute midnight timestamps + rest hours
2. For each unfilled slot, iterate candidate doctors:
   - If the doctor can work directly (no rest conflict), assign immediately
   - Otherwise, find which of their shifts block them (`findBlockingShifts`)
   - Try to move each blocker to another doctor via `canTakeOverShift` (checks leave, bridge days, and rest constraints)
   - If direct takeover fails, attempt a **swap chain** (up to 3 levels deep): recursively free the target doctor's blockers. Leave/bridge checks are enforced at every level of the chain.
3. After each swap, verify no rest violations via post-hoc `verifyNoViolations`; undo the entire swap if verification fails

#### Stage 3: Cluster-Based MAC Solver

For any remaining gaps after swap repair:

1. Group unfilled days into clusters (days within 3 of each other)
2. For each cluster, create a window extending ±3 days from the cluster bounds
3. Remove all generated shifts in the window and re-solve via MRV-ordered depth-first search
4. Candidates pre-filtered by leave/bridge/base-rest; sorted by eligibility (most constrained first)
5. Limited to 50,000 nodes and 200 slots per window

### Phase 3: Validation & Output

1. Rebuild counters from final shifts
2. Check base norm attainment per doctor → warnings
3. Detect conflicts (understaffing, rest violations)
4. Compute per-doctor statistics
5. Return `{ shifts, conflicts, warnings, doctorStats }`

## Tuning Parameters

| Constant | Value | File | Purpose |
|----------|-------|------|---------|
| `TEAM_GAP_THRESHOLD` | 1.5 | doctor-selection.ts | Max paceGap difference to prefer same-team doctor |
| `LOOKAHEAD_PENALTY_WEIGHT` | 5 | doctor-selection.ts | Penalty per tight future day blocked |
| `CONTINUATION_BONUS` | 10 | doctor-selection.ts | Bonus for day→night rotation pattern |
| `BACKTRACK_MAX_RADIUS` | 3 | repair.ts | Max window radius for stage 1 backtracking |
| `BACKTRACK_MAX_NODES` | 5,000 | repair.ts | Node limit per stage 1 window |
| `BACKTRACK_MAX_SLOTS` | 30 | repair.ts | Max slots per stage 1 window |
| `MAX_CHAIN_DEPTH` | 3 | repair.ts | Max swap chain depth in stage 2 |
| `MAC_MAX_NODES` | 50,000 | repair.ts | Node limit per stage 3 cluster window |
| `MAC_MAX_SLOTS` | 200 | repair.ts | Max slots per stage 3 cluster window |
| `MAC_WINDOW_MARGIN` | 3 | repair.ts | Days of padding around unfilled clusters in stage 3 |
| `MAX_REPAIRABLE_RATIO` | 0.15 | repair.ts | Skip repair if >15% slots unfilled |
| `MIN_REPAIRABLE_SLOTS` | 3 | repair.ts | Minimum unfilled slots to attempt repair |

## Module Map

```
scheduling-engine.ts  ← Orchestrator (constructor + generateSchedule + static method delegates)
  ├── constants.ts        ← SCHEDULING_CONSTANTS, ScheduleGenerationOptions, EngineContext
  ├── calendar-utils.ts   ← formatDate, utcMs, getDaysInMonth, isHoliday, etc.
  ├── bridge-days.ts      ← computeDoctorBridgeDays, computeAllBridgeDays
  ├── constraints.ts      ← canDoctorWork, canDoctorWorkWithTimeline
  ├── doctor-selection.ts ← selectDoctorsForShift, getLookaheadPenalty
  ├── repair.ts           ← repairUnfilledSlots (3-stage: backtrack → swap → MAC)
  ├── stats.ts            ← recordShift, rebuildCounters, calculateBaseNorm, calculateDoctorStats
  └── validation.ts       ← detectConflicts, validateLeaveDays, computeUnderstaffedDays
```

## Data Flow

```
ScheduleGenerationOptions
  │
  ▼
┌─────────────────────────┐
│  Constructor             │  → bridge days, fixed shift index, holiday set
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Greedy Pass             │  → shifts[] (may have gaps)
│  (day-by-day loop)       │
│  uses: selectDoctors,    │
│        canDoctorWork,    │
│        recordShift       │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Repair Pass (3-stage)   │  → fills gaps via backtrack,
│  1. small-window DFS     │     swap chains, and
│  2. swap-based repair    │     cluster MAC solver
│  3. cluster MAC solver   │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Validation & Stats      │  → conflicts, warnings, doctorStats
│  uses: detectConflicts,  │
│        checkDoctorNorms  │
└────────────┬────────────┘
             ▼
  ScheduleGenerationResult
  { shifts, conflicts, warnings, doctorStats }
```
