# Scheduling Algorithm V2 — Cadence-First

## Problem

Generate a monthly schedule assigning doctors to 12h shifts (day 08:00–20:00, night 20:00–08:00) or 24h shifts (08:00–08:00+1). Three doctor classes: **team doctors** (12h, grouped in teams with rotation order), **floating 12h doctors** (no team, fill gaps and receive rebalanced shifts), and **floating/team 24h doctors** (rigid 72h cadence).

### Hard Constraints
- **Leave/bridge days**: no shifts on leave or bridge days
- **Coverage**: each day needs `shiftsPerDay` day + `shiftsPerNight` night doctors
- **24h rest**: 72h between 24h shifts (rigid every-4-day cadence)
- **Max 3 consecutive working days**: a doctor who has worked 3 days in a row must have the 4th day off — enforced in ALL phases including force-fill
- **No NZN pattern (no 36h continuous work)**: Night(D) → Day(D+1) → Night(D+1) is forbidden (would mean 36h continuous work from 20:00 to 08:00+2) — enforced in ALL phases including force-fill
- **Optional doctors**: excluded from main scheduling; used only in Phase 2d to resolve rest violations

If hard constraints prevent filling a slot, it is left understaffed and flagged as a warning. A 30-second timeout on force-fill prevents excessive computation.

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

Doctors with `is_optional = true` are filtered out before the main scheduling phases (1–2c). They are brought back in Phase 2d to resolve rest violations, and fully restored before stats/conflict detection so they appear in output with `baseNorm: 0`.

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

**No rest constraint checking** — the D-N-R-R cycle naturally satisfies 24h/48h rest requirements. Cross-month boundary violations are acceptable. **Hard constraints** (max 3 consecutive days, no NZN) are always checked; a doctor is skipped if assigning their cadence shift would violate them.

### Phase 1b: 24h Doctor Allocation

Assigns 24h doctors to a strict every-4-day cadence (72h rest). Doctors are split into two groups:

**Constrained teams** (teams with `max_doctors_per_shift`): Use round-robin distribution. All cadence days across all offsets are collected and sorted chronologically. For each day, the available doctor with the fewest shifts so far is assigned.

**Unconstrained 24h doctors** (floating or teams without the constraint):
1. **Optimal offset permutation**: For the first 4 doctors, brute-force all doctor→offset assignments to maximize total shifts
2. **Swing doctors**: Remaining 24h doctors are assigned the offset that maximizes their shift count

Shifts are placed unconditionally (no capacity check) — 24h doctors may push coverage above `shiftsPerDay`/`shiftsPerNight` on some days. Leave/bridge days are the only reason a cadence slot may be skipped.

24h shifts are immutable after placement.

### Phase 1c: Rebalance Overstaffed Slots

After Phase 1 and 1b, 24h shifts (fixed manual or generated) may overstuff one shift type while leaving the opposite understaffed. For example, a manual 24h shift on a day where the cadence already fills all night slots creates night overstaffing and day understaffing.

For each day that has any 24h shifts:
1. Count total day and night coverage (fixed + generated + 24h)
2. If one type is overstaffed AND the opposite is understaffed, convert non-manual cadence shifts from the overstaffed type to the opposite
3. Each conversion is validated against hard constraints (max consecutive days, no NZN) and rest constraints (`canDoctorWorkWithTimeline`)
4. Counters are rebuilt after any conversions

This phase preserves total coverage per day — it only redistributes shifts between day and night types.

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

### Phase 2d: Optional Doctor Rest Violation Repair

After all scheduling phases are complete, optional doctors (`is_optional = true`) — normally excluded from scheduling — are used to resolve rest violations.

Loop (up to 50 iterations):
1. Detect all rest violation pairs (two consecutive shifts for the same doctor with insufficient rest gap) using `findRestViolationPairs()`
2. If no violations → done
3. For each violation pair, try to reassign one of the two offending shifts:
   - **Try the later shift first** (removing it widens the gap for the earlier shift), then the earlier
   - Skip 24h shifts (immutable cadence) and manual/fixed shifts
4. For the candidate shift, find an available optional doctor (sorted by fewest shifts for fairness):
   - Must not be on leave or bridge day
   - Must pass `canDoctorWorkWithTimeline()` — no overlap, no rest violations in either direction (checks against the optional doctor's own existing shifts + previous month shifts)
   - Must not exceed 48h weekly hours cap
5. If a valid optional doctor is found, reassign the shift to them, rebuild counters, and restart violation detection from scratch (to handle cascading effects)
6. If no violation could be resolved in a full pass → done (fixed point)

**Trade-offs**: A donor doctor's hours decrease by 12h, potentially pushing them below their base norm — this is acceptable because resolving a rest violation is a higher priority than norm compliance (the donor appears with a norm warning in the output). Slot coverage is unchanged since the shift is reassigned, not removed.

### Phase 2e: Force-Fill Remaining Understaffed Slots

Last-resort pass that guarantees zero understaffed days in the final output. Runs after all other scheduling phases.

For each day (1..N) chronologically:
1. Re-count coverage (fixed + generated + 24h shifts) for both day and night
2. If fully staffed → skip
3. Build candidate pool: all non-optional doctors **excluding** those from constrained teams (`max_doctors_per_shift`) — these teams are capped and should not be force-assigned
4. **24h preference**: if both day AND night are understaffed, try unconstrained 24h doctors first (one shift covers both slots). Sort by lowest total hours worked
5. **12h fill**: for any remaining shortfall per shift type, assign 12h doctors sorted by lowest total hours worked

**No rest constraint checking** — shifts are assigned unconditionally and marked `is_forced_coverage = true`. Leave and bridge day constraints are still respected (a doctor on leave/bridge is never assigned). **Hard constraints** (max 3 consecutive days, no NZN) are always enforced — a candidate who would violate them is skipped, potentially leaving the slot understaffed.

A **30-second timeout** applies to the entire force-fill phase. If exceeded, remaining slots are left unfilled and a timeout warning is emitted.

After this phase, understaffed conflicts may occur when hard constraints prevent any eligible doctor from being assigned, or when every eligible doctor is already assigned/on leave/bridge for that date.

### Phase 3: Validation & Output

1. Rebuild counters from final shift list
2. Check doctor norms (warnings for doctors below minimum hours)
3. Apply shift rounding for stats
4. Restore full doctor list (including optional)
5. Detect conflicts (understaffing, rest violations — forced-coverage tagged)
6. Compute per-doctor stats

Returns `{ shifts, conflicts, warnings, doctorStats }`.

### Post-Generation: Shift Equalization

Activated manually via the **"Equalize shifts"** button after a schedule has been generated. Equalizes shift distribution among **equalizable (EQZB)** doctors so that the integer part of every EQZB doctor's "+/- Norm" delta differs by < 2 from every other EQZB doctor's delta.

**EQZB doctors**: not optional, not in a team with `max_doctors_per_shift`, not 24h.

Loop (up to 500 iterations):
1. Compute "+/- Norm" delta for all EQZB doctors: `(totalHours - baseNorm) / 12`
2. Find the doctor with the **lowest** delta (under-normed, UN) and the one with the **highest** (over-normed)
3. If `trunc(highest.delta) - trunc(lowest.delta) < 2` → equalization complete (e.g. 1.1 vs 2.9 is fine; 1.1 vs 3.0 is not)
4. Identify all **ON donors**: EQZB doctors whose integer-part delta is ≥ 2 above the UN doctor's
5. For the UN doctor, scan every available day/night slot in the month (skipping leave, bridge, and days where UN already has a shift)
6. For each candidate slot, find the best shift to **steal** from an ON donor:
   - **Rest-violation shifts have priority** — stealing a shift that is already part of a rest violation reduces total violations
   - Among equal-priority candidates, prefer the ON donor with the **highest** "+/- Norm" delta
   - Manual/fixed shifts (`is_manual`) are never stolen
7. If no stealable shift is found → equalization cannot progress further, exit
8. Execute the swap: reassign the shift from the ON donor to the UN doctor, rebuild counters, repeat

**Key properties**:
- Slot coverage is unchanged — one doctor replaces another on the same shift
- Preferring violation shifts as steal targets reduces the total number of rest violations
- The algorithm is idempotent: running it twice produces the same result

Implementation: `src/lib/scheduling/equalize-shifts.ts`

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
  ├── constraints.ts         ← isDoctorOnLeave, isDoctorOnBridgeDay, canDoctorWorkWithTimeline, violatesHardConstraints
  ├── prng.ts                ← Seeded PRNG (mulberry32)
  ├── stats.ts               ← recordShift, rebuildCounters, calculateBaseNorm, calculateDoctorStats
  └── validation.ts          ← detectConflicts, findRestViolationPairs
```
