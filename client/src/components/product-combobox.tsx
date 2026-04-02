import { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Package, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const NAVY = "#1e1b4b";
const GOLD = "#C5A059";

export interface ProductOption {
  id: number;
  name: string;
  sku?: string | null;
  sellingPrice?: number | null;
  costPrice?: number | null;
  variants?: Array<{ name: string; sku: string; sellingPrice?: number; costPrice?: number }>;
}

interface ProductComboboxProps {
  products: ProductOption[];
  value: string;
  onChange: (product: ProductOption) => void;
  className?: string;
  placeholder?: string;
  "data-testid"?: string;
}

export function ProductCombobox({
  products,
  value,
  onChange,
  className,
  placeholder = "Rechercher un produit...",
  "data-testid": testId,
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  // Whether the typed text is exactly a stock product name (exact match)
  const isExactMatch = useMemo(
    () => search.trim() !== "" && products.some(p => p.name.toLowerCase() === search.trim().toLowerCase()),
    [products, search]
  );

  // Show the "create" option when user has typed something with no exact match
  const showCreate = search.trim().length > 0 && !isExactMatch;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handleSelect = (product: ProductOption) => {
    onChange(product);
    setOpen(false);
    setSearch("");
  };

  const handleCreate = () => {
    const name = search.trim();
    if (!name) return;
    // Synthetic product option with id=-1 signals "manual / not in stock"
    onChange({ id: -1, name, sku: null, sellingPrice: null, costPrice: null });
    setOpen(false);
    setSearch("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); setSearch(""); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length === 1 && !showCreate) {
        handleSelect(filtered[0]);
      } else if (showCreate) {
        // If there's exactly one filtered match still, prefer it; else create
        if (filtered.length === 1) {
          handleSelect(filtered[0]);
        } else {
          handleCreate();
        }
      }
    }
    if (e.key === "ArrowDown" && !open) setOpen(true);
  };

  const sellingDH = (p: ProductOption) => {
    const cents = p.sellingPrice ?? p.costPrice ?? 0;
    return (cents / 100).toFixed(0);
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? search : value}
          onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setSearch(""); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          data-testid={testId}
          className={cn(
            "w-full h-9 rounded-md border px-3 pr-8 text-sm outline-none transition-colors",
            "bg-white placeholder:text-muted-foreground cursor-pointer",
            "border-gray-200 focus:ring-2 focus:ring-offset-1",
            open ? "ring-2 ring-offset-1" : ""
          )}
          style={open ? { borderColor: GOLD, outline: "none", boxShadow: `0 0 0 2px ${GOLD}33` } : {}}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute z-[200] mt-1 w-full rounded-md border border-border bg-white shadow-lg overflow-hidden"
          style={{ maxHeight: 280 }}
        >
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            {/* Stock results */}
            {filtered.length > 0 && filtered.map(p => {
              const isSelected = value === p.name;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors",
                    "hover:bg-amber-50 border-b border-gray-50 last:border-0",
                    isSelected ? "bg-amber-50" : ""
                  )}
                >
                  <Check
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ opacity: isSelected ? 1 : 0, color: GOLD }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" style={{ color: NAVY }}>{p.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.sku && (
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {p.sku}
                        </span>
                      )}
                      {(p.sellingPrice || p.costPrice) ? (
                        <span className="text-[11px] font-semibold" style={{ color: GOLD }}>
                          {sellingDH(p)} DH
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* No stock results at all */}
            {products.length === 0 && !showCreate && (
              <div className="flex flex-col items-center justify-center py-5 px-4 text-center">
                <Package className="w-7 h-7 mb-1.5 text-gray-300" />
                <p className="text-xs font-medium text-gray-500">Aucun produit dans le stock.</p>
                <p className="text-xs text-gray-400 mt-0.5">Tapez un nom et appuyez sur Entrée pour ajouter manuellement.</p>
              </div>
            )}

            {/* No match in stock but not empty */}
            {filtered.length === 0 && !showCreate && search.trim() === "" && products.length > 0 && null}

            {/* Divider before create option when there are also stock results */}
            {showCreate && filtered.length > 0 && (
              <div className="border-t border-gray-100 mx-2 my-0.5" />
            )}

            {/* ── Creatable option ── */}
            {showCreate && (
              <button
                type="button"
                onClick={handleCreate}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-indigo-50 border-b border-gray-50 last:border-0"
              >
                <PlusCircle className="w-3.5 h-3.5 shrink-0" style={{ color: NAVY }} />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-400 mr-1.5">Ajouter</span>
                  <span className="font-semibold truncate" style={{ color: NAVY }}>"{search.trim()}"</span>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">Entrée ↵</span>
              </button>
            )}

            {/* Nothing typed and no products */}
            {!showCreate && filtered.length === 0 && search.trim() !== "" && products.length > 0 && (
              <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                Aucun résultat — tapez Entrée pour ajouter manuellement.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
