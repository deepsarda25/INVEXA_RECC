import { useState } from "react";
import type { CSSProperties } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric";
  onFocus?: () => void;
  onBlur?: () => void;
  style?: CSSProperties;
  required?: boolean;
};

export function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete = "off",
  maxLength,
  inputMode,
  onFocus,
  onBlur,
  style,
  required
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        className="form-input"
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        inputMode={inputMode}
        onFocus={onFocus}
        onBlur={onBlur}
        required={required}
        style={{ paddingRight: "2.75rem", ...style }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide" : "Show"}
        style={{
          position: "absolute",
          right: "0.6rem",
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-3)",
          display: "flex",
          alignItems: "center",
          padding: "0.2rem"
        }}
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
