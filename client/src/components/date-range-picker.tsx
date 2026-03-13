import { useState, useRef, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  placeholder?: string;
}

const DAYS = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];
const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(s: string): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  while (m > 11) { m -= 12; y++; }
  while (m < 0) { m += 12; y--; }
  return { year: y, month: m };
}

function applyPreset(preset: string): DateRange {
  const now = new Date();
  const today = toDateStr(now);
  switch (preset) {
    case "today": return { from: today, to: today };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const yd = toDateStr(y); return { from: yd, to: yd };
    }
    case "last7": {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      return { from: toDateStr(d), to: today };
    }
    case "last30": {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      return { from: toDateStr(d), to: today };
    }
    case "thisMonth": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateStr(first), to: today };
    }
    case "lastMonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toDateStr(first), to: toDateStr(last) };
    }
    default: return { from: "", to: "" };
  }
}

const PRESETS = [
  { key: "today", label: "Aujourd'hui" },
  { key: "yesterday", label: "Hier" },
  { key: "last7", label: "Dernier 7 Jours" },
  { key: "last30", label: "Dernier 30 Jours" },
  { key: "thisMonth", label: "Ce Mois" },
  { key: "lastMonth", label: "Dernier Mois" },
];

function CalendarMonth({
  year, month, tempStart, tempEnd, hoverDate,
  onDayClick, onDayHover,
}: {
  year: number; month: number;
  tempStart: string; tempEnd: string; hoverDate: string;
  onDayClick: (d: string) => void;
  onDayHover: (d: string) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const effectiveEnd = tempEnd || hoverDate;

  const rangeStart = tempStart && effectiveEnd
    ? (tempStart <= effectiveEnd ? tempStart : effectiveEnd)
    : tempStart;
  const rangeEnd = tempStart && effectiveEnd
    ? (tempStart <= effectiveEnd ? effectiveEnd : tempStart)
    : effectiveEnd;

  const weeks: (number | null)[][] = [];
  let current: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) current.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    current.push(d);
    if (current.length === 7) { weeks.push(current); current = []; }
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }

  return (
    <div className="min-w-[224px]">
      <div className="text-center font-bold text-sm mb-3 text-foreground">
        {MONTHS_FR[month]} {year}
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) => {
            if (day === null) return <div key={di} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isStart = dateStr === tempStart;
            const isEnd = dateStr === tempEnd;
            const isSelectedEndpoint = isStart || isEnd;
            const isInRange = rangeStart && rangeEnd && dateStr > rangeStart && dateStr < rangeEnd;
            const isRangeStart = dateStr === rangeStart && rangeEnd && rangeStart !== rangeEnd;
            const isRangeEnd = dateStr === rangeEnd && rangeStart && rangeStart !== rangeEnd;

            return (
              <div
                key={di}
                className={[
                  "relative flex items-center justify-center cursor-pointer select-none",
                  isRangeStart ? "rounded-l-full" : "",
                  isRangeEnd ? "rounded-r-full" : "",
                  isInRange || isRangeStart || isRangeEnd ? "bg-blue-100 dark:bg-blue-900/30" : "",
                ].join(" ")}
                onClick={() => onDayClick(dateStr)}
                onMouseEnter={() => onDayHover(dateStr)}
              >
                <div className={[
                  "w-8 h-8 flex items-center justify-center text-xs font-medium rounded-full transition-colors",
                  isSelectedEndpoint ? "bg-blue-600 text-white font-bold" : "",
                  !isSelectedEndpoint && isInRange ? "text-blue-800 dark:text-blue-300" : "",
                  !isSelectedEndpoint && !isInRange ? "hover:bg-muted text-foreground" : "",
                ].join(" ")}>
                  {day}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function DateRangePicker({ value, onChange, placeholder = "Sélectionner une période" }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [leftYear, setLeftYear] = useState(now.getFullYear());
  const [leftMonth, setLeftMonth] = useState(now.getMonth());
  const [tempStart, setTempStart] = useState(value.from || "");
  const [tempEnd, setTempEnd] = useState(value.to || "");
  const [hoverDate, setHoverDate] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const right = addMonths(leftYear, leftMonth, 1);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleDayClick(dateStr: string) {
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(dateStr);
      setTempEnd("");
      setActivePreset(null);
    } else {
      if (dateStr < tempStart) {
        setTempEnd(tempStart);
        setTempStart(dateStr);
      } else {
        setTempEnd(dateStr);
      }
      setActivePreset(null);
    }
  }

  function handlePreset(key: string) {
    const range = applyPreset(key);
    setTempStart(range.from);
    setTempEnd(range.to);
    setActivePreset(key);
    const d = parseDateStr(range.from);
    setLeftYear(d.getFullYear());
    setLeftMonth(d.getMonth());
  }

  function handleApply() {
    const start = tempStart <= tempEnd ? tempStart : tempEnd;
    const end = tempStart <= tempEnd ? tempEnd : tempStart;
    onChange({ from: start || tempStart, to: end || tempStart });
    setOpen(false);
  }

  function handleCancel() {
    setTempStart(value.from || "");
    setTempEnd(value.to || "");
    setActivePreset(null);
    setOpen(false);
  }

  function handleClear() {
    onChange({ from: "", to: "" });
    setTempStart("");
    setTempEnd("");
    setActivePreset(null);
  }

  const displayText = value.from && value.to
    ? `${formatDisplay(value.from)} - ${formatDisplay(value.to)}`
    : value.from
      ? formatDisplay(value.from)
      : null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setTempStart(value.from || "");
          setTempEnd(value.to || "");
          setOpen(v => !v);
        }}
        className={[
          "flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-colors",
          "bg-white dark:bg-card border-border/60 hover:border-primary/40",
          displayText ? "text-foreground" : "text-muted-foreground",
        ].join(" ")}
        data-testid="button-date-range-picker"
      >
        <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="min-w-[140px] text-left">{displayText || placeholder}</span>
        {displayText && (
          <span
            className="ml-1 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); handleClear(); }}
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-11 right-0 bg-white dark:bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex" style={{ minWidth: 560 }}>
          {/* Preset sidebar */}
          <div className="w-40 border-r border-border/50 py-3 flex flex-col gap-0.5">
            {PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePreset(p.key)}
                className={[
                  "text-left px-4 py-2.5 text-sm transition-colors",
                  activePreset === p.key
                    ? "bg-blue-600 text-white font-semibold"
                    : "hover:bg-muted text-foreground",
                ].join(" ")}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar + footer */}
          <div className="flex flex-col">
            {/* Navigation + two calendars */}
            <div className="flex gap-6 p-4 pb-2">
              {/* Left month */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => { const p = addMonths(leftYear, leftMonth, -1); setLeftYear(p.year); setLeftMonth(p.month); }}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold">{MONTHS_FR[leftMonth]} {leftYear}</span>
                  <div className="w-6" />
                </div>
                <CalendarMonth
                  year={leftYear} month={leftMonth}
                  tempStart={tempStart} tempEnd={tempEnd} hoverDate={hoverDate}
                  onDayClick={handleDayClick} onDayHover={setHoverDate}
                />
              </div>

              {/* Right month */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-6" />
                  <span className="text-sm font-bold">{MONTHS_FR[right.month]} {right.year}</span>
                  <button
                    type="button"
                    onClick={() => { const n = addMonths(leftYear, leftMonth, 1); setLeftYear(n.year); setLeftMonth(n.month); }}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <CalendarMonth
                  year={right.year} month={right.month}
                  tempStart={tempStart} tempEnd={tempEnd} hoverDate={hoverDate}
                  onDayClick={handleDayClick} onDayHover={setHoverDate}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
              <span className="text-sm text-muted-foreground font-mono">
                {tempStart ? formatDisplay(tempStart) : "—"}
                {" - "}
                {tempEnd ? formatDisplay(tempEnd) : (tempStart ? formatDisplay(tempStart) : "—")}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCancel} className="h-8 px-4 text-sm">
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApply}
                  disabled={!tempStart}
                  className="h-8 px-4 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
