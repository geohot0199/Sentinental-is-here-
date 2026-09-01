"use client";

/**
 * Registers this site's tools with the browser's model context on every page,
 * and publishes the `window.SENTINEL_MCP` handle that agents (and the Bridge
 * station) use to introspect the registration.
 *
 * Renders nothing. It lives in the root layout because an agent may arrive at
 * any URL — the landing page, the console, or a ChatGPT Sites deployment — and
 * the tool surface must be identical wherever it lands.
 */
import { useEffect } from "react";
import { bootWebMcp, exposeBridgeHandle } from "@/lib/webmcp";

export default function WebMcpBoot() {
  useEffect(() => {
    let alive = true;
    void bootWebMcp()
      .then(() => {
        if (alive) exposeBridgeHandle();
      })
      .catch(() => {
        /* a browser that refuses registration is reported by the Bridge station */
      });
    return () => {
      alive = false;
    };
  }, []);

  return null;
}
