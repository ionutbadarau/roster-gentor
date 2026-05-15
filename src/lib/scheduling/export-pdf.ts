import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Doctor, Team, Shift, LeaveDay, NationalHoliday } from '@/types/scheduling';
import { SchedulingEngine } from '@/lib/scheduling-engine';
import { formatDateString } from '@/lib/scheduling/shift-utils';

export interface ExportPdfOptions {
  doctors: Doctor[];
  teams: Team[];
  shifts: Shift[];
  leaveDays: LeaveDay[];
  nationalHolidays: NationalHoliday[];
  currentMonth: number;
  currentYear: number;
  monthName: string;
  dayNames: string[];
  labels: {
    dayShiftLetter: string;
    nightShiftLetter: string;
    leaveLetter: string;
    shift24hLetter: string;
    doctorColumn: string;
    title: string;
  };
}

// RGB color tuples
const COLORS = {
  dayShift: [59, 130, 246] as [number, number, number],       // blue-500
  nightShift: [99, 102, 241] as [number, number, number],     // indigo-500
  shift24h: [168, 85, 247] as [number, number, number],       // purple-500
  leave: [249, 115, 22] as [number, number, number],          // orange-500
  bridge: [245, 158, 11] as [number, number, number],         // amber-500
  weekend: [229, 231, 235] as [number, number, number],       // gray-200
  holiday: [187, 247, 208] as [number, number, number],       // green-200
  understaffed: [254, 202, 202] as [number, number, number],  // red-200
  white: [255, 255, 255] as [number, number, number],
  headerBg: [243, 244, 246] as [number, number, number],      // gray-100
};

export function exportSchedulePdf(options: ExportPdfOptions): void {
  const {
    doctors, teams, shifts, leaveDays, nationalHolidays,
    currentMonth, currentYear, monthName, dayNames, labels,
  } = options;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const teamOrderMap = new Map(teams.map((t) => [t.id, t.order ?? 0]));
  const sortedDoctors = [...doctors].sort((a, b) => {
    const teamA = a.team_id ? (teamOrderMap.get(a.team_id) ?? 999) : 999;
    const teamB = b.team_id ? (teamOrderMap.get(b.team_id) ?? 999) : 999;
    if (teamA !== teamB) return teamA - teamB;
    return (a.display_order ?? 0) - (b.display_order ?? 0);
  });

  // Helper functions
  const isWeekend = (day: number): boolean => {
    const date = new Date(currentYear, currentMonth, day);
    return date.getDay() === 0 || date.getDay() === 6;
  };

  const isHoliday = (day: number): boolean => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    return nationalHolidays.some(h => h.holiday_date === dateStr);
  };

  const isNonWorkingDay = (day: number): boolean => isWeekend(day) || isHoliday(day);

  const isBridgeDay = (doctorId: string, day: number): boolean => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    // Check manual bridge days
    if (leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr && l.leave_type === 'bridge')) return true;
    const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(doctorId, leaveDays, currentMonth, currentYear, nationalHolidays);
    return bridgeDays.has(dateStr);
  };

  // Create PDF in landscape A4
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Title
  doc.setFontSize(16);
  doc.text(`${labels.title} — ${monthName} ${currentYear}`, 14, 15);

  // Build header row: Doctor | 1 Mo | 2 Tu | ...
  const headerRow = [
    labels.doctorColumn,
    ...days.map(day => {
      const date = new Date(currentYear, currentMonth, day);
      const dayOfWeek = dayNames[date.getDay()];
      return `${day}\n${dayOfWeek}`;
    }),
  ];

  const shiftChars = new Set([labels.dayShiftLetter, labels.nightShiftLetter]);
  const lowercaseShiftLetters = (text: string): string =>
    text.split('').map(c => shiftChars.has(c) ? c.toLowerCase() : c).join('');

  // Build body rows
  const bodyRows = sortedDoctors.map(doctor => {
    const team = teams.find(t => t.id === doctor.team_id);
    const useSmallLetters = !!team?.use_small_shift_letters;
    const doctorLabel = doctor.name + (doctor.is_floating ? ' (F)' : '') + (doctor.is_optional ? ' (OPT)' : '');

    const built = days.map(day => {
      const dateStr = formatDateString(currentYear, currentMonth, day);
      const shift = shifts.find(s => s.doctor_id === doctor.id && s.shift_date === dateStr);
      const isLeave = leaveDays.some(l => l.doctor_id === doctor.id && l.leave_date === dateStr && l.leave_type !== 'bridge' && l.leave_type !== 'no_bridge');
      const bridge = isBridgeDay(doctor.id, day);

      if (shift) {
        let text = '';
        if (shift.shift_type === '24h') {
          if (shift.dispatch_type === 'day') text = `X${labels.nightShiftLetter}`;
          else if (shift.dispatch_type === 'night') text = `${labels.dayShiftLetter}Y`;
          else text = labels.shift24hLetter;
        } else if (shift.shift_type === 'day') {
          text = shift.dispatch_type === 'day' ? 'X' : labels.dayShiftLetter;
        } else if (shift.shift_type === 'night') {
          text = shift.dispatch_type === 'night' ? 'Y' : labels.nightShiftLetter;
        }

        const effectiveSmall = shift.is_small_letter ?? useSmallLetters;
        const display = effectiveSmall ? lowercaseShiftLetters(text) : text;
        return { match: text, display };
      }
      if (isLeave) return { match: labels.leaveLetter, display: labels.leaveLetter };
      if (bridge) return { match: '·', display: '·' };
      return { match: '', display: '' };
    });

    return {
      doctorLabel,
      cells: built.map(b => b.display),
      matchCells: built.map(b => b.match),
    };
  });

  // Render table with autoTable
  autoTable(doc, {
    startY: 20,
    head: [headerRow],
    body: bodyRows.map(row => [row.doctorLabel, ...row.cells]),
    theme: 'grid',
    styles: {
      fontSize: 6,
      cellPadding: 1,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 7,
      lineWidth: 0.1,
      lineColor: [200, 200, 200],
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: [31, 41, 55],
      fontSize: 5.5,
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 28, fontSize: 6 },
    },
    didParseCell(data) {
      // Style day columns in header
      if (data.section === 'head' && data.column.index > 0 && data.column.index <= days.length) {
        const day = days[data.column.index - 1];
        if (isHoliday(day)) {
          data.cell.styles.fillColor = COLORS.holiday;
        } else if (isWeekend(day)) {
          data.cell.styles.fillColor = COLORS.weekend;
        }
      }

      // Style body cells
      if (data.section === 'body') {
        const rowIdx = data.row.index;
        const colIdx = data.column.index;
        const rowData = bodyRows[rowIdx];
        if (!rowData) return;

        // Doctor name column
        if (colIdx === 0) {
          return;
        }

        // Day cells
        if (colIdx >= 1 && colIdx <= days.length) {
          const day = days[colIdx - 1];
          // Use the uppercase match text for styling — display text may be lowercase
          // when a team has use_small_shift_letters enabled, which would break label comparisons.
          const cellText = rowData.matchCells[colIdx - 1] ?? '';

          // Dispatch on 24h shifts: XN or ZY (day/night dispatch letters combined)
          const is24hDispatch = cellText === `X${labels.nightShiftLetter}` || cellText === `${labels.dayShiftLetter}Y`;
          if (is24hDispatch || cellText === labels.shift24hLetter) {
            data.cell.styles.textColor = COLORS.shift24h;
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText === 'X') {
            data.cell.styles.textColor = COLORS.dayShift;
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText === 'Y') {
            data.cell.styles.textColor = COLORS.nightShift;
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText.startsWith(labels.dayShiftLetter) && !cellText.startsWith(labels.shift24hLetter)) {
            data.cell.styles.textColor = COLORS.dayShift;
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText.startsWith(labels.nightShiftLetter)) {
            data.cell.styles.textColor = COLORS.nightShift;
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText === labels.leaveLetter) {
            data.cell.styles.textColor = COLORS.leave;
            data.cell.styles.fontStyle = 'bold';
          } else if (cellText === '·') {
            data.cell.styles.textColor = COLORS.bridge;
          }

          // Weekend/holiday bg for empty cells
          if (!cellText) {
            if (isHoliday(day)) {
              data.cell.styles.fillColor = COLORS.holiday;
            } else if (isWeekend(day)) {
              data.cell.styles.fillColor = COLORS.weekend;
            }
          }
        }
      }
    },
  });

  // Save
  const filename = `schedule_${monthName}_${currentYear}.pdf`;
  doc.save(filename);
}
