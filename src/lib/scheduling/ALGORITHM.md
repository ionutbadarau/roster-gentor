# Scheduling Algorithm V2 — Cadence-First

## Problem

Generate a monthly schedule assigning doctors to 12h shifts (day 08:00–20:00, night 20:00–08:00) or 24h shifts (08:00–08:00+1). Three doctor classes: **team doctors** (12h, grouped in teams with rotation order), **floating 12h doctors** (no team, fill gaps and receive rebalanced shifts), and **floating/team 24h doctors** (rigid 72h cadence).

### Hard Constraints
- **Leave/bridge days**: no shifts on leave or bridge days
- **Coverage**: each day needs `shiftsPerDay` day + `shiftsPerNight` night doctors
- **24h rest**: 72h between 24h shifts (rigid every-4-day cadence)
- **Optional doctors**: excluded from all automatic scheduling

### Soft Goals
- **Cadence adherence**: team doctors follow D-N-R-R rotation strictly
- **Basic fairness**: gap-fill candidates sorted by fewest shifts
- **Norm equalization**: all non-optional doctors should meet their base norm (7h × working days minus leave)

### Key Difference from V1

V2 prioritizes **cadence strictness** over constraint satisfaction. V1 uses a multi-attempt greedy algorithm with 8-stage repair and equalization. V2 assigns cadence shifts unconditionally in Phase 1, then fills remaining gaps in Phase 2 — rest violations are allowed and flagged rather than avoided.

### Determinism

Fully deterministic — identical inputs always produce identical output. Seeded PRNG (mulberry32), default seed: `year * 100 + month`.

## Algorithm Overview

### Pre-filter: Optional Doctors

Doctors with `is_optional = true` are filtered out before scheduling. Restored before stats/conflict detection so they appear in output with `baseNorm: 0`.

### Phase 0: Compute Cadence Grids

Each team follows a 4-day cycle: **Day, Night, Rest, Rest** (D-N-R-R).

Teams are staggered sequentially by their `order` field so that team N starts its Day shift on day N:

```
offset = (cycle - (order - 1) % cycle) % cycle
position = (day - 1 + offset) % cycle
  position 0 = Day, 1 = Night, 2-3 = Rest
```

Example with 4 teams:
```
         Day1  Day2  Day3  Day4  Day5  Day6  Day7  Day8
Team 1:   D     N     R     R     D     N     R     R
Team 2:   R     D     N     R     R     D     N     R
Team 3:   R     R     D     N     R     R     D     N
Team 4:   N     R     R     D     N     R     R     D
```

On any given day, exactly one team is on Day, one on Night, and two are resting.

Uses `computeTeamCadenceGrid()` from `../cadence.ts` with `{ sequential: true }`.

### Phase 1: Fill Cadence Shifts Strictly

For each day (1..N), for each team:
1. Look up cadence type for the team on this day (Day, Night, or Rest)
2. If Rest → skip
3. For each doctor in the team:
   - Skip if already assigned (manual/fixed shift)
   - Skip if on leave or bridge day
   - Assign the cadence shift (Day or Night)

**No rest constraint checking** — the D-N-R-R cycle naturally satisfies 24h/48h rest requirements. Cross-month boundary violations are acceptable.

### Phase 1b: 24h Doctor Allocation

Assigns 24h doctors to a strict every-4-day cadence (72h rest). Doctors are split into two groups:

**Constrained teams** (teams with `max_doctors_per_shift`): Use round-robin distribution. All cadence days across all offsets are collected and sorted chronologically. For each day, the available doctor with the fewest shifts so far is assigned.

**Unconstrained 24h doctors** (floating or teams without the constraint):
1. **Optimal offset permutation**: For the first 4 doctors, brute-force all doctor→offset assignments to maximize total shifts
2. **Swing doctors**: Remaining 24h doctors are assigned the offset that maximizes their shift count

Shifts are placed unconditionally (no capacity check) — 24h doctors may push coverage above `shiftsPerDay`/`shiftsPerNight` on some days. Leave/bridge days are the only reason a cadence slot may be skipped.

24h shifts are immutable after placement.

### Phase 2: Identify & Fill Uncovered Slots

After cadence assignment, count coverage per day per shift type. For each slot below the required staffing level:

1. Collect candidates: all 12h doctors (floating + team) not already assigned that day, not on leave/bridge
2. Sort by fewest total shifts (basic fairness)
3. Assign shifts to fill the gap

**Rest violations are allowed** in this phase — these are marked `is_forced_coverage = true` so the UI renders them with a warning indicator.

### Phase 2c: Norm Equalization (Shift Rebalancing)

After gap-filling, floating 12h doctors may still be below their base norm if cadence + 24h doctors already covered all slots. This phase steals 12h shifts from over-norm donors and reassigns them to under-norm recipients.

Loop (up to 200 iterations):
1. Find the non-optional, non-24h doctor with the **largest deficit** (baseNorm − currentHours)
2. If no one is below norm → done
3. Scan all 12h shifts for the best one to steal:
   - **Donor must have surplus ≥ 12h** above their own base norm (so stealing doesn't push them below)
   - Recipient must not be on leave or bridge day
   - Recipient must not already have a shift that day
   - Recipient must not get rest violations from the new shift
   - Prefer the donor with the **highest surplus**
4. If no stealable shift found → done (some doctors may remain below norm)
5. Reassign the shift (`doctor_id` → recipient), rebuild counters, repeat

**Key property**: slot coverage is unchanged — one doctor replaces another on the same shift. Only hours move from over-norm to under-norm doctors. 24h shifts are never stolen (they follow rigid cadence).

### Phase 3: Validation & Output

1. Rebuild counters from final shift list
2. Check doctor norms (warnings for doctors below minimum hours)
3. Apply shift rounding for stats
4. Restore full doctor list (including optional)
5. Detect conflicts (understaffing, rest violations — forced-coverage tagged)
6. Compute per-doctor stats

Returns `{ shifts, conflicts, warnings, doctorStats }`.

## Module Map

```
v2/
  scheduling-engine-v2.ts   ← Orchestrator: cadence assignment, 24h alloc, gap-fill
  scheduling-v2.worker.ts   ← Web Worker wrapper
  use-scheduling-worker-v2.ts ← React hook for worker communication

Shared modules (../):
  ├── cadence.ts             ← computeTeamCadenceGrid (sequential mode), computeDoctorCadenceSchedule
  ├── constants.ts           ← SCHEDULING_CONSTANTS, EngineContext
  ├── calendar-utils.ts      ← formatDate, utcMs, getDaysInMonth
  ├── bridge-days.ts         ← computeAllBridgeDays
  ├── constraints.ts         ← isDoctorOnLeave, isDoctorOnBridgeDay
  ├── prng.ts                ← Seeded PRNG (mulberry32)
  ├── stats.ts               ← recordShift, rebuildCounters, calculateBaseNorm, calculateDoctorStats
  └── validation.ts          ← detectConflicts
```
