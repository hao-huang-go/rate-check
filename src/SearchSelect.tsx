import { useState } from "react";

export interface SearchOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  id: string;
  placeholder: string;
  selected: SearchOption | null;
  search: (query: string) => SearchOption[];
  onSelect: (option: SearchOption | null) => void;
  noMatch: string;
}

// Type-to-search list, like a combobox but with room for a hint line under each option.
export function SearchSelect({ id, placeholder, selected, search, onSelect, noMatch }: Props) {
  const [query, setQuery] = useState("");
  const results = query.trim() ? search(query) : [];

  if (selected) {
    return (
      <div className="search-selected">
        <div>
          <span className="search-label">{selected.label}</span>
          {selected.hint && <span className="search-hint">{selected.hint}</span>}
        </div>
        <button
          type="button"
          className="search-clear"
          aria-label="Clear"
          onClick={() => {
            onSelect(null);
            setQuery("");
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="search">
      <input
        id={id}
        autoFocus
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() && (
        <ul className="search-results" role="listbox">
          {results.length ? (
            results.map((r) => (
              <li key={r.value}>
                <button type="button" role="option" aria-selected={false} onClick={() => onSelect(r)}>
                  <span className="search-label">{r.label}</span>
                  {r.hint && <span className="search-hint">{r.hint}</span>}
                </button>
              </li>
            ))
          ) : (
            <li className="search-empty">{noMatch}</li>
          )}
        </ul>
      )}
    </div>
  );
}
