import type { CSSProperties } from "react";

/**
 * A pure-CSS radar scope — rotating green sweep, range rings, crosshair and
 * pulsing contacts (red = hostile advisory, green = the strike team).
 * No client JS: every pixel of the motion lives in globals.css.
 */
export interface RadarContact {
  /** percentage from the top edge */
  top: number;
  /** percentage from the left edge */
  left: number;
  /** pulse animation delay, seconds */
  delay?: number;
  green?: boolean;
}

const DEFAULT_CONTACTS: RadarContact[] = [
  { top: 30, left: 62, delay: 0 },
  { top: 58, left: 34, delay: 0.9 },
  { top: 71, left: 66, delay: 1.7, green: true },
  { top: 43, left: 48, delay: 2.2 },
];

export default function Radar({
  size,
  contacts = DEFAULT_CONTACTS,
  className = "",
}: {
  size?: number;
  contacts?: RadarContact[];
  className?: string;
}) {
  const style: CSSProperties | undefined = size !== undefined ? { width: size, height: size } : undefined;
  return (
    <div
      className={`radar${className ? ` ${className}` : ""}`}
      style={style}
      role="img"
      aria-label="Radar scope sweeping for vulnerable packages"
    >
      <span className="radar-sweep" aria-hidden />
      {contacts.map((contact, index) => (
        <i
          key={index}
          className={`radar-blip${contact.green === true ? " radar-blip-green" : ""}`}
          style={{
            top: `${contact.top}%`,
            left: `${contact.left}%`,
            animationDelay: `${contact.delay ?? 0}s`,
          }}
        />
      ))}
    </div>
  );
}
