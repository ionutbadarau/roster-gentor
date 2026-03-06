# Scheduling Algorithm

## Problem Statement

Generate a monthly schedule assigning doctors to 12-hour shifts (day 08:00–20:00, night 20:00–08:00) while satisfying hard constraints and optimizing soft goals.

### Hard Constraints
- **Rest periods**: 24h after day shifts, 48h after night shifts, 72h after 24h shifts
- **Weekly limit**: max 48h per doctor per week
- **Leave/bridge days**: no shifts on leave days or bridge days. Leave days on weekends/holidays are allowed and count toward the doctor's leave allocation like any other leave day. Bridge days come from two sources:
  - **Auto-computed**: weekends/holidays sitting between two leave periods (computed by `bridge-days.ts`)
  - **Manual**: leave days with `leave_type === 'bridge'`, added by the user on weekends/holidays via the grid UI. The UI offers this option when a weekend/holiday is adjacent to leave on at least one side (before or after).
  - Both types block scheduling but do **not** reduce the doctor's base norm
- **Slot coverage**: each day must have `shiftsPerDay` day-shift doctors and `shiftsPerNight` night-shift doctors
- **Base norm** (when feasible): each doctor must work ≥ 7h × (working days − leave days) where only `leave_type !== 'bridge'` leave days count. Enforced via norm-equalization repair after the greedy + slot-repair passes. If total required shifts across all doctors exceeds total available slots (structurally infeasible), this constraint is relaxed to best-effort with warnings.

### Soft Goals
- **Equalization**: distribute shifts evenly across doctors; extra shifts (beyond base norm) should have at most a 2-shift gap between any two doctors
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

#### Equalization Targets

Before the greedy loop, each doctor's target is computed as:

```
baseTarget = ceil(baseNorm / SHIFT_DURATION)
totalExtraShifts = max(0, totalSlots - sum(baseTargets))
fairExtra = totalExtraShifts / numDoctors
target = baseTarget + fairExtra
```

This ensures the paceGap mechanism distributes extra shifts (beyond base norm) equally from the start, rather than letting doctors with high base norms accumulate disproportionately more shifts.

#### Doctor Selection Heuristic (`doctor-selection.ts`)

For each candidate doctor, compute a **priority score**:

```
score = paceGap - lookaheadPenalty + continuationBonus - extraShiftPenalty
```

- **paceGap** = `(target × elapsedAvailDays / totalAvailDays) - currentShifts`
  - Positive = behind schedule, negative = ahead
  - Doctors with upcoming leave fall behind faster → get prioritized
- **lookaheadPenalty** = penalty if this doctor's rest would block a tight future day (checked 1-3 days ahead)
- **continuationBonus** = +10 if this is a night shift and the doctor worked yesterday's day shift
- **extraShiftPenalty** = `(currentShifts - avgShifts) × EXTRA_SHIFT_EQUALIZATION_WEIGHT`
  - Active even for under-target doctors, preventing early accumulation imbalances
  - Compares total shifts vs average across all doctors (not just extras beyond target)

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

### Phase 3: Norm Equalization Repair

After slot repair, if any doctor's hours fall below their base norm while the configuration is feasible:

1. Rebuild counters from final shifts
2. Identify **deficit doctors** (below norm) and **surplus doctors** (above norm)
3. Sort deficits by largest gap first
4. For each deficit doctor, try to swap a shift from a surplus doctor:
   - The surplus doctor must still meet their own norm after losing the shift
   - The deficit doctor must pass all hard constraints (rest, leave, bridge) for the swapped shift
   - The deficit doctor must not already have a shift of the same type on that day
5. Repeat until all doctors meet norm or no more beneficial swaps exist
6. Limited to 200 iterations to prevent infinite loops

### Phase 4: Extra-Shift Equalization Repair

After norm equalization, doctors may still have unequal numbers of extra shifts (shifts beyond their base norm target). This phase evens them out, targeting a max gap of 1 extra shift between any two doctors.

Uses **date-based rest checking** (midnight-to-midnight distance) consistent with `detectConflicts` semantics — not exact shift start/end times, which are stricter and would prevent valid transfers.

#### Direct Transfer

For each iteration, identify the doctor with the most extra shifts (surplus) and the one with the fewest (deficit). Try to reassign one of the surplus doctor's shifts directly to the deficit doctor:

1. The surplus doctor must still meet their base norm after losing the shift
2. The deficit doctor must pass leave, bridge day, duplicate, and date-based rest checks

#### Chain Transfer

If no direct transfer works (due to rest constraints), attempt a 3-doctor chain transfer:

```
surplus → middle doctor (takes surplus's shift)
middle → deficit doctor (deficit takes one of middle's shifts)
```

- The middle doctor's net shift count stays the same (gains 1, loses 1)
- Both the middle and deficit doctor's full schedules are verified post-swap
- If verification fails, the swap is rolled back

Limited to 300 iterations. Stops when the max extra-shift gap is ≤ 1.

### Phase 5: Validation & Output

1. Rebuild counters from final shifts (post equalization repairs)
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
| `EXTRA_SHIFT_EQUALIZATION_WEIGHT` | 3 | doctor-selection.ts | Penalty weight for doctors above average shift count |
| `BACKTRACK_MAX_RADIUS` | 3 | repair.ts | Max window radius for stage 1 backtracking |
| `BACKTRACK_MAX_NODES` | 5,000 | repair.ts | Node limit per stage 1 window |
| `BACKTRACK_MAX_SLOTS` | 30 | repair.ts | Max slots per stage 1 window |
| `MAX_CHAIN_DEPTH` | 3 | repair.ts | Max swap chain depth in stage 2 |
| `MAC_MAX_NODES` | 50,000 | repair.ts | Node limit per stage 3 cluster window |
| `MAC_MAX_SLOTS` | 200 | repair.ts | Max slots per stage 3 cluster window |
| `MAC_WINDOW_MARGIN` | 3 | repair.ts | Days of padding around unfilled clusters in stage 3 |
| `MAX_REPAIRABLE_RATIO` | 0.15 | repair.ts | Skip repair if >15% slots unfilled |
| `MIN_REPAIRABLE_SLOTS` | 3 | repair.ts | Minimum unfilled slots to attempt repair |
| `MAX_ITERATIONS` (norm) | 200 | repair.ts | Max swap iterations for norm equalization |
| `MAX_ITERATIONS` (extra) | 300 | repair.ts | Max iterations for extra-shift equalization |
| `MAX_EXTRA_SHIFT_GAP` | 1 | repair.ts | Target max gap between any two doctors' extra shifts |

## Module Map

```
scheduling-engine.ts  ← Orchestrator (constructor + generateSchedule + static method delegates)
  ├── constants.ts        ← SCHEDULING_CONSTANTS, ScheduleGenerationOptions, EngineContext
  ├── calendar-utils.ts   ← formatDate, utcMs, getDaysInMonth, isHoliday, etc.
  ├── bridge-days.ts      ← computeDoctorBridgeDays, computeAllBridgeDays
  ├── constraints.ts      ← canDoctorWork, canDoctorWorkWithTimeline
  ├── doctor-selection.ts ← selectDoctorsForShift, getLookaheadPenalty
  ├── repair.ts           ← repairUnfilledSlots (3-stage), repairNormDeficits, repairExtraShiftEqualization
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
│  Norm Equalization       │  → swaps shifts from surplus
│  uses: repairNormDeficits│     to deficit doctors
│        calculateBaseNorm │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Extra-Shift Equalization│  → transfers/chain-transfers
│  uses: repairExtraShift  │     to even out extra shifts
│        Equalization      │     (max 1-shift gap target)
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
