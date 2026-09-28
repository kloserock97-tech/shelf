import { useState } from 'react';
import './spring-toggle.css';

type Props = {
  label: string;
  defaultOn?: boolean;
  onChange?: (on: boolean) => void;
};

export function SpringToggle({ label, defaultOn = false, onChange }: Props) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      className="toggle"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        setOn(!on);
        onChange?.(!on);
      }}
    >
      <span className="toggle__knob" />
    </button>
  );
}
