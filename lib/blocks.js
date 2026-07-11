// Unified availability-block model (single source of truth for the backend).
//
// Historically the store kept `blockedSlots`: one object per 30-min cell
//   { id, date, time, reason, employeeId? }
// which forced clicking every slot to block a range and had no notion of
// multi-day absences or full-day time off.
//
// Going forward the canonical model is `blockRanges`: one object per range
//   {
//     id,
//     dateStart, dateEnd,   // inclusive "YYYY-MM-DD" range; single day => equal
//     allDay,               // true => whole day(s) off, times ignored
//     timeStart, timeEnd,   // "HH:MM"; timeEnd is EXCLUSIVE; only if !allDay
//     employeeId | null,    // null => applies to every stylist
//     reason,
//     type,                 // "absence" | "block"
//     createdAt
//   }
//
// Legacy `blockedSlots` are still read (converted on the fly), so nothing
// breaks during the transition. The frontends migrate them lazily on edit.
//
// NOTE: the browser-side .jsx files cannot import this module (they run under
// Babel-standalone, not ESM). They replicate the same overlap logic inline —
// keep this file and those copies in sync.

const SLOT_MIN = 30; // legacy blockedSlots each covered a 30-min cell

export function timeToMin(t) {
  const [h, m] = String(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Convert one legacy blockedSlot into the unified range shape.
export function legacySlotToRange(s) {
  const start = timeToMin(s.time);
  const endMin = start + SLOT_MIN;
  const hh = String(Math.floor(endMin / 60)).padStart(2, "0");
  const mm = String(endMin % 60).padStart(2, "0");
  return {
    id: s.id,
    dateStart: s.date,
    dateEnd: s.date,
    allDay: false,
    timeStart: s.time,
    timeEnd: `${hh}:${mm}`,
    employeeId: s.employeeId ?? null,
    reason: s.reason ?? "No disponible",
    type: "block",
    createdAt: s.createdAt ?? 0,
    _legacy: true,
  };
}

// Merge new blockRanges with any legacy blockedSlots into one normalized list.
export function blocksFromStore(store) {
  const ranges = Array.isArray(store?.blockRanges) ? store.blockRanges : [];
  const legacy = Array.isArray(store?.blockedSlots) ? store.blockedSlots : [];
  return [...ranges, ...legacy.map(legacySlotToRange)];
}

// Does a block apply to the stylist an appointment is assigned to?
// A block with employeeId=null (or missing) applies to everyone.
export function blockAppliesToStylist(block, stylistId) {
  if (block.employeeId == null) return true;
  return block.employeeId === stylistId;
}

function dateInRange(date, start, end) {
  return date >= start && date <= (end || start);
}

// True if `appt` (with its serviceDur + optional bufferAfter) overlaps any
// block. `stylistId` is the employee id the appointment is assigned to, used to
// scope per-employee blocks. Salon-wide blocks (employeeId=null) always apply.
export function blockConflict(blocks, appt, stylistId) {
  const newStart = timeToMin(appt.time);
  const newEnd =
    newStart + (Number(appt.serviceDur) || 0) + (Number(appt.bufferAfter) || 0);

  return (blocks || []).some((b) => {
    if (!dateInRange(appt.date, b.dateStart, b.dateEnd)) return false;
    if (!blockAppliesToStylist(b, stylistId)) return false;
    if (b.allDay) return true;
    const bStart = timeToMin(b.timeStart);
    const bEnd = timeToMin(b.timeEnd);
    return bStart < newEnd && newStart < bEnd; // interval overlap
  });
}
