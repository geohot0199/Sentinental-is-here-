import type { CSSProperties } from "react";

/**
 * The SENTINEL wordmark — every letter rendered inside its own framed box,
 * with the chrome gradient clipped to the glyph. Used in the hero (large) and
 * the nav bar (small). The `--i` custom property staggers the entrance.
 */
interface WordmarkProps {
  text?: string;
  small?: boolean;
  hidden?: boolean;
  className?: string;
}

export default function Wordmark({ text = "SENTINEL", small = false, hidden = false, className = "" }: WordmarkProps) {
  const cls = `wordmark${small ? " wordmark-sm" : ""}${className ? ` ${className}` : ""}`;
  return (
    <span className={cls} {...(hidden ? { "aria-hidden": true } : { role: "img", "aria-label": text })}>
      {text.split("").map((ch, index) => (
        <span className="letter" key={`${ch}-${index}`} style={{ "--i": index } as CSSProperties}>
          <i>{ch}</i>
        </span>
      ))}
    </span>
  );
}
