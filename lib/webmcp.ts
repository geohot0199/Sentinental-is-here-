"use client";

/**
 * SENTINEL — WebMCP bridge (ported from site/js/webmcp.js).
 *
 * Installs `document.modelContext` when the browser does not ship one yet,
 * then registers the OMNI-LAB tool catalog against it. A real WebMCP agent
 * and the on-page cockpit call identical code.
 */
import {
  BreachLab,
  BioSynth,
  ChronoForensic,
  MetaLoop,
  ZkEscrow,
  WEBMCP_TOOLS_CATALOG,
  registerAllWebMCPTools,
} from "./engines.js";

export { BreachLab, BioSynth, ChronoForensic, MetaLoop, ZkEscrow, WEBMCP_TOOLS_CATALOG };

type ModelContext = {
  registerTool: (definition: unknown) => { unregister: () => void };
  getTools: () => unknown[];
  invokeTool: (name: string, input: unknown) => Promise<unknown>;
};

let booted = false;
let polyfilled = false;
let registeredCount = 0;
let toolNames: string[] = [];

/** Provide a spec-shaped `document.modelContext` polyfill when the browser lacks one. */
function ensureModelContext(): { polyfilled: boolean; context: ModelContext } {
  const existing = (document as unknown as { modelContext?: ModelContext }).modelContext;
  if (existing && typeof existing.registerTool === "function") {
    return { polyfilled: false, context: existing };
  }

  const tools = new Map<string, { name?: string; execute?: (input: unknown) => Promise<unknown> }>();
  const context: ModelContext = {
    registerTool(definition: unknown) {
      const tool = definition as { name?: string; execute?: (input: unknown) => Promise<unknown> };
      if (!tool || typeof tool.name !== "string") {
        throw new TypeError("registerTool requires a named tool definition.");
      }
      tools.set(tool.name, tool);
      const name = tool.name;
      return { unregister: () => tools.delete(name) };
    },
    getTools() {
      return Array.from(tools.values());
    },
    async invokeTool(name: string, input: unknown) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Unknown WebMCP tool: ${name}`);
      return tool.execute?.(input ?? {});
    },
  };

  Object.defineProperty(document, "modelContext", {
    value: context,
    configurable: true,
    writable: false,
  });
  return { polyfilled: true, context };
}

/** Idempotent boot — safe on every render and on re-hydration. */
export function bootWebMcp(): { polyfilled: boolean; registeredCount: number; toolNames: string[] } {
  if (booted) return { polyfilled, registeredCount, toolNames };
  const ensured = ensureModelContext();
  const registration = registerAllWebMCPTools(document);
  polyfilled = ensured.polyfilled;
  registeredCount = registration.registeredCount;
  toolNames = registration.tools;
  booted = true;
  return { polyfilled, registeredCount, toolNames };
}

export const webmcp = {
  get polyfilled() {
    return polyfilled;
  },
  get registeredCount() {
    return registeredCount;
  },
  get toolNames() {
    return toolNames;
  },
  get catalog() {
    return WEBMCP_TOOLS_CATALOG;
  },
  /** Invoke a registered tool by name; always resolves through modelContext. */
  invoke: (name: string, input: unknown) =>
    (document as unknown as { modelContext: ModelContext }).modelContext.invokeTool(name, input),
  /** Tools belonging to one OMNI-LAB module. */
  byModule: (module: string) => WEBMCP_TOOLS_CATALOG.filter((t) => t.module === module),
};
