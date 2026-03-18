# Scheduling Algorithm

## Problem

Generate a monthly schedule assigning doctors to 12h shifts (day 08:00–20:00, night 20:00–08:00) or 24h shifts (08:00–08:00+1). Two doctor classes: **team doctors** (12h, grouped in teams with rotation order) and **floating 24h doctors**.

### Hard Constraints
- **Rest**: 24h after day, 48h after night, 72h after 24h shifts
- **Weekly limit**: max 48h/week per doctor
- **Leave/bridge days**: no shifts on leave or bridge days (weekends/holidays between two leave periods). Bridge days block scheduling but don't reduce base norm
- **Coverage**: each day needs `shiftsPerDay` day + `shiftsPerNight` night doctors
- **Base norm**: each doctor works ≥ 7h × (working days − leave days)
- **Optional doctors**: doctors marked `is_optional` are excluded from all automatic scheduling — they receive shifts only via manual assignment

### Soft Goals
- Equalize shifts (extra shifts beyond norm have ≤2-shift gap between doctors)
- Team cohesion (prefer same-team doctors on the same day)
- Day→night continuation bonus
- Cadence following (D-N-R-R rotation per team, staggered by team order)

## Algorithm Overview

### Pre-filter: Optional Doctors

At the start of `generateSchedule()`, doctors with `is_optional = true` are filtered out of the active doctor list. This filtered list is used throughout all scheduling phases (24h allocation, greedy, repair, norm checks). The full doctor list (including optional) is restored only before stats computation and conflict detection, so optional doctors still appear in the output with `baseNorm: 0` and `meetsBaseNorm: true`. Optional doctors can still have manual shifts added to them — these are included in conflict detection and counter rebuilds.

### Phase 0: 24h Allocation

Assigns 24h floating doctors to days before the greedy pass. Three sub-phases:

1. **Optimal offset permutation**: For the first `minGap` (=4) doctors, brute-force all doctor→offset assignments (C(n,4)×4! combos) to maximize total shifts + tightness coverage. Each offset produces shifts every 4 days.
2. **Swing doctor greedy fill**: Remaining doctors iterate days by tightness (fewest available 12h doctors first), assigning greedily with fewest-shifts-first ordering.
3. **Extra tight-day coverage**: Add a second 24h doctor on days where 12h availability is critically low.

Multiple allocation variants are generated (with perturbation seeds) for the multi-attempt greedy.

### Phase 1: Multi-Attempt Greedy (30 attempts)

Each attempt uses a different 24h allocation variant + random score perturbation. Best attempt (fewest unfilled slots, then fewest norm-deficit doctors) is kept.

Per attempt, iterates day-by-day:

```
for each day:
  emit pre-allocated 24h shifts
  for each shift type (day, night):
    selectDoctorsForShift(slotsNeeded)
```

**Doctor selection scoring** (`doctor-selection.ts`):

```
score = paceGap - lookaheadPenalty + continuationBonus
      - extraShiftPenalty + restOverlapBonus
      + cadenceOnDutyBonus - cadenceBreakPenalty + perturbation
```

- **paceGap**: how far behind schedule (target × elapsed/total − current shifts)
- **lookaheadPenalty**: penalizes if rest would block a tight future day (1-3 days ahead)
- **cadenceOnDutyBonus/BreakPenalty**: follow D-N-R-R cadence, **scaled to 30% on tight days** (when available doctors < shiftsPerDay + shiftsPerNight + 2)
- **restOverlapBonus**: prefer doctors whose rest falls on leave/bridge/month-end
- **extraShiftPenalty**: `(current − avgShifts) × weight` — active even for under-target doctors
- **Hard partition**: under-target doctors always before met-target; team cohesion within 1.5 paceGap threshold

### Phase 2: Repair (6 stages)

Fills gaps left by the greedy pass. Skipped if >15% of slots unfilled.

1. **Small-window backtracking**: Per unfilled slot, radius 2-3 DFS re-solve (5K nodes, 30 slots max)
2. **Swap-based repair**: Find doctors blocked by rest from adjacent shifts; reassign blockers via swap chains (up to 3 levels)
3. **Sliding-window FC solver**: Per unfilled day, ±3 day window re-solve with MRV ordering, symmetry breaking, 20 random restarts (200K nodes)
4. **ILS (Iterated Local Search)**: Remove random 12h shifts near unfilled days, greedy re-fill with MRV day ordering (tightest first). 5s budget, 80 shifts perturbed per iteration.
5. **Norm equalization**: Swap shifts from surplus→deficit doctors (200 iterations max)
6. **Extra-shift equalization**: Direct + chain transfers to equalize extra shifts (target ≤1 gap, 300 iterations)

### Phase 3: Validation & Output

Rebuild counters → check norms (warnings, skipping optional doctors) → restore full doctor list (including optional) → rebuild counters again → detect conflicts (understaffing, rest violations) → compute per-doctor stats (optional doctors get `baseNorm: 0`) → return `{ shifts, conflicts, warnings, doctorStats }`.

## Module Map

```
scheduling-engine.ts  ← Orchestrator: 24h alloc, multi-attempt greedy, repair pipeline
  ├── constants.ts        ← SCHEDULING_CONSTANTS, EngineContext
  ├── calendar-utils.ts   ← formatDate, utcMs, getDaysInMonth, getWeekNumber
  ├── bridge-days.ts      ← computeDoctorBridgeDays, computeAllBridgeDays
  ├── cadence.ts          ← computeTeamCadenceGrid, computeDoctorCadenceSchedule
  ├── constraints.ts      ← canDoctorWork, canDoctorWorkWithTimeline
  ├── doctor-selection.ts ← selectDoctorsForShift, getLookaheadPenalty
  ├── repair.ts           ← repairUnfilledSlots, repairNormDeficits, repairExtraShiftEqualization, repairWithLocalSearch
  ├── shift-utils.ts      ← getShiftStartMs/EndMs, getRestHours, hasActualTimeRestConflict
  ├── stats.ts            ← recordShift, rebuildCounters, calculateBaseNorm, calculateDoctorStats
  └── validation.ts       ← detectConflicts, validateLeaveDays, computeUnderstaffedDays
```

## Key Tuning Parameters

| Constant | Value | File |
|----------|:-----:|------|
| `CADENCE_ON_DUTY_BONUS` | 8 (×0.3 on tight days) | doctor-selection.ts |
| `CADENCE_BREAK_PENALTY` | 8 (×0.3 on tight days) | doctor-selection.ts |
| `LOOKAHEAD_PENALTY_WEIGHT` | 5 | doctor-selection.ts |
| `CONTINUATION_BONUS` | 3 | doctor-selection.ts |
| `EXTRA_SHIFT_EQUALIZATION_WEIGHT` | 5 | doctor-selection.ts |
| `REST_OVERLAP_WEIGHT` | 3 | doctor-selection.ts |
| `TEAM_GAP_THRESHOLD` | 1.5 | doctor-selection.ts |
| `NUM_ATTEMPTS` | 30 | scheduling-engine.ts |
| `MAX_REPAIRABLE_RATIO` | 0.15 | repair.ts |
| `PERTURB_COUNT` (ILS) | 80 | repair.ts |
