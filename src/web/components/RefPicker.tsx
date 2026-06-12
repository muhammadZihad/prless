import type { DiffMode, RefsResponse } from '../../shared/types';

interface Props {
  refs: RefsResponse | null;
  mode: DiffMode;
  base: string;
  head: string;
  onChange: (mode: DiffMode, base: string, head: string) => void;
}

export function RefPicker({ refs, mode, base, head, onChange }: Props) {
  const branches = refs?.branches ?? [];

  return (
    <div className="ref-picker">
      <label className="field">
        <select
          className="select"
          value={mode}
          aria-label="Diff source"
          onChange={(e) => onChange(e.target.value as DiffMode, base, head)}
        >
          <option value="working">Working tree vs HEAD</option>
          <option value="staged">Staged vs HEAD</option>
          <option value="compare">Compare branches…</option>
        </select>
      </label>

      {mode === 'compare' && (
        <>
          <label className="field">
            <select
              className="select"
              value={base}
              aria-label="Base branch"
              onChange={(e) => onChange(mode, e.target.value, head)}
            >
              <option value="">base…</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <span className="arrow">→</span>
          <label className="field">
            <select
              className="select"
              value={head}
              aria-label="Head branch"
              onChange={(e) => onChange(mode, base, e.target.value)}
            >
              <option value="">head…</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
