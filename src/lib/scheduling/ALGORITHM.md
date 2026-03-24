# Scheduling Algorithm

## Problem

Generate a monthly schedule assigning doctors to 12h shifts (day 08:00–20:00, night 20:00–08:00) or 24h shifts (08:00–08:00+1). Two doctor classes: **team doctors** (12h, grouped in teams with rotation order) and **floating 24h doctors**.

### Hard Constraints
- **Rest (12h doctors)**: 24h after day, 48h after night (may be broken by forced-coverage shifts in Phase 2b — marked `is_forced_coverage`)
- **Rest (24h doctors)**: exactly 72h after each 24h shift — no more, no less. 24h doctors follow a rigid every-4-day cadence set in Phase 0. Their shifts are never added, removed, or moved by any repair or forced-coverage step. Leave/bridge days are the only exception that may cause a gap.
- **Weekly limit**: max 48h/week per doctor
- **Leave/bridge days**: no shifts on leave or bridge days (weekends/holidays between two leave periods). Bridge days block scheduling but don't reduce base norm
- **Coverage**: each day needs `shiftsPerDay` day + `shiftsPerNight` night doctors
- **Base norm**: each doctor works ≥ 7h × (working days − leave days)
- **Optional doctors**: doctors marked `is_optional` are excluded from all automatic scheduling — they receive shifts only via manual assignment

### Soft Goals
- **Extra-shift equalization (hard constraint)**: extra shifts beyond norm have ≤1-shift gap between all non-optional 12h doctors. 24h doctors are excluded from equalization (their schedule is fixed by cadence). Enforced via: extra-shift gap in multi-attempt selection and repair transfers.
- Team cohesion (prefer same-team doctors on the same day)
- Day→night continuation bonus
- Cadence following (D-N-R-R rotation per team, staggered by team order)

### Determinism

The algorithm is fully deterministic — identical inputs always produce identical output. All randomness uses a seeded PRNG (mulberry32, `prng.ts`). Default seed: `year * 100 + month`. Time budgets replaced with iteration/node caps so results don't vary across machines.

## Algorithm Overview

### Pre-filter: Optional Doctors

At the start of `generateSchedule()`, doctors with `is_optional = true` are filtered out of the active doctor list. This filtered list is used throughout all scheduling phases (24h allocation, greedy, repair, norm checks). The full doctor list (including optional) is restored only before stats computation and conflict detection, so optional doctors still appear in the output with `baseNorm: 0` and `meetsBaseNorm: true`. Optional doctors can still have manual shifts added to them — these are included in conflict detection and counter rebuilds.

### Phase 0: 24h Allocation

Assigns 24h floating doctors to a strict every-4-day cadence (72h rest — no more, no less). Two sub-phases:

1. **Optimal offset permutation**: For the first `minGap` (=4) doctors, brute-force all doctor→offset assignments (C(n,4)×4! combos) to maximize total shifts + tightness coverage. Each offset produces shifts every 4 days.
2. **Swing doctor offset assignment**: Remaining doctors are each assigned the offset (1–4) that maximizes their shift count and tightness coverage, then placed on a strict every-4-day cadence from that offset.

Once placed, 24h shifts are immutable — no repair, equalization, or forced-coverage step may add, remove, or move them. Leave/bridge days are the only reason a cadence slot may be skipped.

### Phase 1: Multi-Attempt Greedy (30 attempts)

Each attempt uses a different 24h allocation variant + seeded PRNG score perturbation. Best attempt (fewest unfilled slots, then fewest norm-deficit doctors) is kept.

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

### Phase 2: Repair (8 stages)

Fills gaps left by the greedy pass. Skipped if >15% of slots unfilled.

1. **Small-window backtracking**: Per unfilled slot, radius 2-3 DFS re-solve (5K nodes, 30 slots max)
2. **Swap-based repair**: Find doctors blocked by rest from adjacent shifts; reassign blockers via swap chains (up to 3 levels)
3. **Sliding-window FC solver**: Per unfilled day, ±3 day window re-solve with MRV ordering, symmetry breaking, 20 random restarts (200K nodes)
4. **ILS (Iterated Local Search)**: Remove random 12h shifts near unfilled days, greedy re-fill with MRV day ordering (tightest first). 5s budget, 80 shifts perturbed per iteration.
5. **Norm equalization**: Swap shifts from surplus→deficit doctors (200 iterations max)
6. **Extra-shift equalization (iterative)**: Direct + chain transfers to equalize extra shifts among 12h doctors only (target ≤1 gap, 200ms budget). 24h doctors are excluded — their shifts are immutable.
7. **Extra-shift equalization (hard enforcement)**: Removes 12h shifts from surplus doctors until gap ≤1. Uses a **coverage guard** (`coverageGuard=true` via `enforceExtraShiftEqualizationSafe`): skips removal when it would drop a day below required staffing (coverage < required). This prevents equalization from *creating* new understaffed days — shifts are only removed from overstaffed slots.
8. **Post-equalization coverage repair** (`repairPostEqualizationCoverage`): Fills understaffed slots that remain after equalization enforcement, using two strategies:
   - *Strategy 1 (swap)*: Move a 12h shift from an overstaffed slot to an understaffed one for the same doctor — perfectly preserves equalization since the doctor's shift count is unchanged.
   - *Strategy 2 (add)*: Assign a new shift to a doctor whose extra-shift count is strictly below the current max (`extra < maxExtra`), preserving gap ≤1. Candidates sorted by lowest extra first.

### Phase 2b: Forced Coverage (second pass)

After all repair stages, fills **every remaining understaffed slot** — the schedule must have zero understaffed days. This pass MAY break rest constraints when necessary; such shifts are marked `is_forced_coverage = true` so the UI renders them with an amber warning ring.

**Equalization invariant (non-negotiable):** the max extra-shift gap between any two non-optional 12h doctors remains ≤ 1 after this phase. 24h doctors are excluded (rigid cadence).

**24h doctors are never involved in forced coverage.** Their shifts are immutable after Phase 0.

**Candidate ranking (all strategies):** When multiple doctors can fill a forced-coverage slot, the algorithm picks the **most rested** candidate (longest time since their last shift ended). This minimizes the severity of any rest violation. Additionally, assignments that would create an effective 24h shift (day + night on the same date) for a 12h-configured doctor are deprioritized.

Three strategies for 12h doctors, tried in order of preference:

1. **Strategy A — Swap (same doctor):** Move a 12h shift from an overstaffed slot to an understaffed slot for the same doctor. Shift count unchanged → equalization perfectly preserved. Rest violations allowed (marked `is_forced_coverage`). Among valid swaps, picks the one where the doctor is most rested on the target date and avoids creating 24h for 12h doctors.

2. **Strategy B — Reassign (cross-doctor):** Take a 12h shift from a surplus-extra doctor on an overstaffed day and give it to a deficit-extra doctor on the understaffed day. Deficit candidates sorted by: avoid 24h creation for 12h doctors, then most rested. Rest violations allowed.

3. **Strategy C — Add 12h shift + immediate rebalance:** Add a new 12h shift to a doctor at min-extra among 12h doctors. Candidates sorted by: rest-safe first, then avoid 24h for 12h doctors, then most rested, then team cohesion. If this breaks the global gap (>1), immediately rebalance by reassigning a surplus doctor's shift from an overstaffed day or removing it.

**Conflict propagation:** `detectConflicts` in `validation.ts` marks rest violations involving forced-coverage shifts with `is_forced_coverage: true`, allowing the UI and tests to distinguish intentional violations from bugs.

### Phase 3: Validation & Output

Rebuild counters → check norms (warnings, skipping optional doctors) → restore full doctor list (including optional) → rebuild counters again → detect conflicts (understaffing, rest violations — forced-coverage violations tagged) → compute per-doctor stats (optional doctors get `baseNorm: 0`) → return `{ shifts, conflicts, warnings, doctorStats }`.

## Module Map

```
scheduling-engine.ts  ← Orchestrator: 24h alloc, multi-attempt greedy, repair pipeline
  ├── prng.ts             ← Seeded PRNG (mulberry32), shuffleArray helper
  ├── constants.ts        ← SCHEDULING_CONSTANTS, EngineContext
  ├── calendar-utils.ts   ← formatDate, utcMs, getDaysInMonth, getWeekNumber
  ├── bridge-days.ts      ← computeDoctorBridgeDays, computeAllBridgeDays
  ├── cadence.ts          ← computeTeamCadenceGrid, computeDoctorCadenceSchedule
  ├── constraints.ts      ← canDoctorWork, canDoctorWorkWithTimeline
  ├── doctor-selection.ts ← selectDoctorsForShift, getLookaheadPenalty
  ├── repair.ts           ← repairUnfilledSlots, repairNormDeficits, repairExtraShiftEqualization, enforceExtraShiftEqualizationSafe, repairPostEqualizationCoverage, repairWithLocalSearch, repairForcedCoverage
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
