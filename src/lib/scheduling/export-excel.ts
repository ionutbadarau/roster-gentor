import { ExportPdfOptions } from './export-pdf';
import { SchedulingEngine } from '@/lib/scheduling-engine';
import { formatDateString } from '@/lib/scheduling/shift-utils';

const COLORS = {
  dayShift: 'FF3B82F6',       // blue-500
  nightShift: 'FF6366F1',     // indigo-500
  shift24h: 'FFA855F7',       // purple-500
  leave: 'FFF97316',          // orange-500
  bridge: 'FFF59E0B',         // amber-500
  weekend: 'FFE5E7EB',        // gray-200
  holiday: 'FFBBF7D0',        // green-200
  headerBg: 'FFF3F4F6',       // gray-100
  headerText: 'FF1F2937',     // gray-800
  border: 'FFC8C8C8',         // gray-300
};

const thinBorder: import('exceljs').Border = {
  style: 'thin',
  color: { argb: COLORS.border },
};

const allBorders: Partial<import('exceljs').Borders> = {
  top: thinBorder,
  left: thinBorder,
  bottom: thinBorder,
  right: thinBorder,
};

export async function exportScheduleExcel(options: ExportPdfOptions): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;

  const {
    doctors, teams, shifts, leaveDays, nationalHolidays,
    currentMonth, currentYear, monthName, dayNames, labels,
  } = options;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const sortedDoctors = [...doctors].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const isWeekend = (day: number): boolean => {
    const date = new Date(currentYear, currentMonth, day);
    return date.getDay() === 0 || date.getDay() === 6;
  };

  const isHoliday = (day: number): boolean => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    return nationalHolidays.some(h => h.holiday_date === dateStr);
  };

  const isBridgeDay = (doctorId: string, day: number): boolean => {
    const dateStr = formatDateString(currentYear, currentMonth, day);
    if (leaveDays.some(l => l.doctor_id === doctorId && l.leave_date === dateStr && l.leave_type === 'bridge')) return true;
    const bridgeDays = SchedulingEngine.computeDoctorBridgeDays(doctorId, leaveDays, currentMonth, currentYear, nationalHolidays);
    return bridgeDays.has(dateStr);
  };

  // Create workbook & worksheet
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(`${monthName} ${currentYear}`);

  // Column widths
  ws.getColumn(1).width = 30;
  for (let i = 0; i < days.length; i++) {
    ws.getColumn(i + 2).width = 5;
  }

  // --- Header row ---
  const headerValues = [
    labels.doctorColumn,
    ...days.map(day => {
      const date = new Date(currentYear, currentMonth, day);
      const dayOfWeek = dayNames[date.getDay()];
      return `${day}\n${dayOfWeek}`;
    }),
  ];
  const headerRow = ws.addRow(headerValues);
  headerRow.height = 28;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 9, color: { argb: COLORS.headerText } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = allBorders;

    const dayIdx = colNumber - 2; // 0-based day index
    if (dayIdx >= 0 && dayIdx < days.length) {
      const day = days[dayIdx];
      if (isHoliday(day)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.holiday } };
      } else if (isWeekend(day)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weekend } };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
      }
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    }
  });

  // --- Body rows ---
  for (const doctor of sortedDoctors) {
    const doctorLabel = doctor.name + (doctor.is_floating ? ' (F)' : '') + (doctor.is_optional ? ' (OPT)' : '');

    const cellValues = days.map(day => {
      const dateStr = formatDateString(currentYear, currentMonth, day);
      const shift = shifts.find(s => s.doctor_id === doctor.id && s.shift_date === dateStr);
      const isLeave = leaveDays.some(l => l.doctor_id === doctor.id && l.leave_date === dateStr && l.leave_type !== 'bridge');
      const bridge = isBridgeDay(doctor.id, day);

      if (shift) {
        if (shift.shift_type === '24h') {
          if (shift.dispatch_type === 'day') return `X${labels.nightShiftLetter}`;
          if (shift.dispatch_type === 'night') return `${labels.dayShiftLetter}Y`;
          return labels.shift24hLetter;
        }
        if (shift.shift_type === 'day') {
          return shift.dispatch_type === 'day' ? 'X' : labels.dayShiftLetter;
        }
        if (shift.shift_type === 'night') {
          return shift.dispatch_type === 'night' ? 'Y' : labels.nightShiftLetter;
        }
      }
      if (isLeave) return labels.leaveLetter;
      if (bridge) return '·';
      return '';
    });

    const row = ws.addRow([doctorLabel, ...cellValues]);
    row.height = 18;

    row.eachCell((cell, colNumber) => {
      cell.border = allBorders;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { size: 8 };

      // Doctor name column
      if (colNumber === 1) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        return;
      }

      const dayIdx = colNumber - 2;
      if (dayIdx < 0 || dayIdx >= days.length) return;
      const day = days[dayIdx];
      const cellText = String(cell.value || '');

      // Color shift cells
      const is24hDispatch = cellText === `X${labels.nightShiftLetter}` || cellText === `${labels.dayShiftLetter}Y`;
      if (is24hDispatch || cellText === labels.shift24hLetter) {
        cell.font = { bold: true, size: 8, color: { argb: COLORS.shift24h } };
      } else if (cellText === 'X') {
        cell.font = { bold: true, size: 8, color: { argb: COLORS.dayShift } };
      } else if (cellText === 'Y') {
        cell.font = { bold: true, size: 8, color: { argb: COLORS.nightShift } };
      } else if (cellText.startsWith(labels.dayShiftLetter) && !cellText.startsWith(labels.shift24hLetter)) {
        cell.font = { bold: true, size: 8, color: { argb: COLORS.dayShift } };
      } else if (cellText.startsWith(labels.nightShiftLetter)) {
        cell.font = { bold: true, size: 8, color: { argb: COLORS.nightShift } };
      } else if (cellText === labels.leaveLetter) {
        cell.font = { bold: true, size: 8, color: { argb: COLORS.leave } };
      } else if (cellText === '·') {
        cell.font = { size: 8, color: { argb: COLORS.bridge } };
      }

      // Weekend/holiday bg for empty cells
      if (!cellText) {
        if (isHoliday(day)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.holiday } };
        } else if (isWeekend(day)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weekend } };
        }
      }
    });
  }

  // Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `schedule_${monthName}_${currentYear}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
