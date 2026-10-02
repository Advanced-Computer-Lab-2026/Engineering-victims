interface CheckboxGroupProps<T extends string> {
  legend: string;
  options: T[];
  value: T[];
  onChange: (value: T[]) => void;
  /** Explains what an empty selection means, e.g. "leave unchecked for all". */
  hint?: string;
}

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/** Multi-select as chips: unlike a "type a comma separated list" box, nothing
 *  gets rewritten while typing and only offered values can be chosen. */
const CheckboxGroup = <T extends string>({ legend, options, value, onChange, hint }: CheckboxGroupProps<T>) => (
  <fieldset className="flex flex-col gap-1.5">
    <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{legend}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const checked = value.includes(option);
        return (
          <label
            key={option}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              checked
                ? 'border-indigo-500/70 bg-indigo-500/10 text-white'
                : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-600'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(toggle(value, option))}
              className="h-3.5 w-3.5 accent-indigo-500"
            />
            {option}
          </label>
        );
      })}
    </div>
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </fieldset>
);

export default CheckboxGroup;
