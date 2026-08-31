import type { CSSProperties } from "react";

/**
 * The SENTINEL wordmark — OpenAI & Anthropic inspired minimalist typography lockup.
 * Clean modern sans letterforms, tight optical kerning, and staggered entrance.
 */
interface WordmarkProps {
  text?: string;
  small?: boolean;
  hidden?: boolean;
  className?: string;
}

export default function Wordmark({
  text = "SENTINEL",
  small = false,
  hidden = false,
  className = "",
}: WordmarkProps) {
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
