import { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CityComboboxProps {
  value: string;
  onChange: (city: string) => void;
  cities: string[];
  isCarrierSpecific?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Searchable city picker.
 * - Filters the city list as you type
 * - Shows orange warning border when the current value is not in the carrier's city list
 * - Allows free-text entry as a fallback (so agents can always type something)
 */
export function CityCombobox({
  value,
  onChange,
  cities,
  isCarrierSpecific = false,
  disabled = false,
  placeholder = "Sélectionner une ville...",
  className,
  "data-testid": testId,
}: CityComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isUnmatched = useMemo(() => {
    if (!value || !isCarrierSpecific || !cities.length) return false;
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return !cities.some(c => norm(c) === norm(value));
  }, [value, cities, isCarrierSpecific]);

  const filtered = useMemo(() => {
    if (!search.trim()) return cities;
    const q = search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return cities.filter(c =>
      c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    );
  }, [cities, search]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handleSelect = (city: string) => {
    onChange(city);
    setOpen(false);
    setSearch("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    if (!open) setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); setSearch(""); }
    if (e.key === "Enter" && filtered.length === 1) handleSelect(filtered[0]);
    if (e.key === "ArrowDown" && !open) setOpen(true);
  };

  return (
    <div className={cn("relative", className)}>
      {/* Trigger button / search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? search : value}
          onChange={handleInputChange}
          onFocus={() => { setOpen(true); setSearch(""); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Choisir un transporteur d'abord" : placeholder}
          data-testid={testId}
          className={cn(
            "w-full h-9 rounded-md border px-3 pr-8 text-sm outline-none transition-colors",
            "bg-white placeholder:text-muted-foreground",
            disabled
              ? "cursor-not-allowed opacity-60 bg-muted border-input"
              : "cursor-pointer focus:ring-2 focus:ring-ring focus:ring-offset-1",
            isUnmatched && !disabled
              ? "border-orange-400 bg-orange-50 focus:ring-orange-300"
              : "border-gray-200 focus:ring-gray-300"
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1">
          {isUnmatched && !disabled && (
            <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
          )}
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Orange warning tooltip */}
      {isUnmatched && !disabled && (
        <p className="mt-0.5 text-[10px] text-orange-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Ville non reconnue par ce transporteur — choisissez dans la liste
        </p>
      )}

      {/* Dropdown */}
      {open && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md overflow-hidden"
          style={{ maxHeight: 240 }}
        >
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                Aucune ville trouvée
              </div>
            ) : (
              filtered.map(city => (
                <button
                  key={city}
                  type="button"
                  onClick={() => handleSelect(city)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    value === city ? "bg-accent/50 font-medium" : ""
                  )}
                >
                  <Check
                    className={cn("w-3.5 h-3.5 shrink-0", value === city ? "opacity-100 text-primary" : "opacity-0")}
                  />
                  {city}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
