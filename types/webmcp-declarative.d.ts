/**
 * The declarative half of WebMCP: a browser that implements the W3C spec can
 * synthesize a tool straight from a form, with no JavaScript at all. The three
 * attributes below are that API. Augmenting React's base attribute interface
 * covers form/input/textarea/buttons in one place.
 */
import "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface HTMLAttributes<T> {
    /** Tool name the browser registers for this form. */
    toolname?: string;
    /** Natural-language description the agent reads when choosing a tool. */
    tooldescription?: string;
    /** Submit the form as soon as the agent fills it, instead of waiting. */
    toolautosubmit?: boolean;
  }
}
