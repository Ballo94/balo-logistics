"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type CountryOption = { country: string; countryCode: string };

export default function SearchableCountrySelect({ countries, value, onChange }: { countries: CountryOption[]; value: string; onChange: (countryCode: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = countries.find((item) => item.countryCode === value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return countries;
    return countries
      .filter((item) => item.country.toLocaleLowerCase().includes(normalized) || item.countryCode.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => Number(!a.country.toLocaleLowerCase().startsWith(normalized)) - Number(!b.country.toLocaleLowerCase().startsWith(normalized)) || a.country.localeCompare(b.country));
  }, [countries, query]);
  const options = query.trim() ? filtered : [{ country: "All countries", countryCode: "" }, ...filtered];

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) { setOpen(false); setQuery(""); }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function choose(countryCode: string) {
    onChange(countryCode);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  return <div ref={rootRef} className="relative">
    <input
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-autocomplete="list"
      value={open ? query : selected?.country ?? ""}
      placeholder="Search countries..."
      autoComplete="off"
      className="field"
      onFocus={() => { setOpen(true); setActiveIndex(0); }}
      onClick={(event) => event.currentTarget.select()}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
      onKeyDown={(event) => {
        const optionCount = options.length;
        if (event.key === "ArrowDown" && optionCount) { event.preventDefault(); setOpen(true); setActiveIndex((index) => (index + 1) % optionCount); }
        if (event.key === "ArrowUp" && optionCount) { event.preventDefault(); setOpen(true); setActiveIndex((index) => (index - 1 + optionCount) % optionCount); }
        if (event.key === "Enter" && open && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex].countryCode); }
        if (event.key === "Escape") { setOpen(false); setQuery(""); }
      }}
    />
    {open && <div id={listboxId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
      {options.map((item, index) => <button type="button" key={item.countryCode || "all"} role="option" aria-selected={value === item.countryCode} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item.countryCode)} className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-bold ${activeIndex === index ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}>{item.country}</button>)}
      {filtered.length === 0 && <p className="px-3 py-3 text-xs font-semibold text-slate-500">No matching countries.</p>}
    </div>}
  </div>;
}
