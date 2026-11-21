// State → city dropdowns. Choosing a state narrows the city list; "Other city…"
// switches to a text field for places not in the list.

import { useState } from 'react';
import { INDIA_CITIES, INDIA_STATES } from '../../../shared/india';
import { Field, Select } from '../ui';

const OTHER = '__other__';

export default function StateCityPicker({
  state,
  city,
  onChange,
  required,
}: {
  state: string;
  city: string;
  onChange: (next: { state: string; city: string }) => void;
  required?: boolean;
}) {
  const cities = INDIA_CITIES[state] ?? [];
  // Start in "other" mode when the current city is not in the state's list.
  const [other, setOther] = useState(Boolean(city) && !cities.includes(city));

  return (
    <>
      <Select
        label="State"
        value={state}
        onChange={(e) => {
          setOther(false);
          onChange({ state: e.target.value, city: '' });
        }}
        options={INDIA_STATES}
      />
      {other ? (
        <div>
          <Field label="City" required={required} placeholder="Type the city" value={city} onChange={(e) => onChange({ state, city: e.target.value })} autoFocus />
          <button
            type="button"
            className="mt-1 min-h-11 text-xs text-fg-3 hover:text-fg"
            onClick={() => {
              setOther(false);
              onChange({ state, city: '' });
            }}
          >
            Pick from the list instead
          </button>
        </div>
      ) : (
        <Select
          label="City"
          required={required}
          value={city}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setOther(true);
              onChange({ state, city: '' });
            } else onChange({ state, city: e.target.value });
          }}
          options={[{ value: '', label: 'Choose a city' }, ...cities.map((c) => ({ value: c, label: c })), { value: OTHER, label: 'Other city…' }]}
        />
      )}
    </>
  );
}
