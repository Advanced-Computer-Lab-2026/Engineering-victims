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
    <legend className="mb-1.5 text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">{legend}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const checked = value.includes(option);
        return (
          <label
            key={option}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-body transition-colors ${
              checked
                ? 'border-primary bg-primary-container text-on-primary-container'
                : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-outline'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(toggle(value, option))}
              className="h-4 w-4 accent-primary"
            />
            {option}
          </label>
        );
      })}
    </div>
    {hint && <p className="text-caption text-on-surface-variant">{hint}</p>}
  </fieldset>
);

export default CheckboxGroup;
