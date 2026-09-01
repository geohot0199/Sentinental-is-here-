/**
 * SENTINEL — WebMCP core.
 *
 * Framework-free and side-effect-free, so the exact same code runs in three
 * places: the browser (lib/webmcp.ts), the test suite (scripts/) and — via the
 * MCP bridge — Node. That is deliberate: an agent must never see a different
 * tool surface than the one the console was tested against.
 *
 * Spec status (September 2026), which is why both surfaces are probed:
 *   · The W3C Web Machine Learning CG moved the getter to `document.modelContext`
 *     on 2026-05-27; `navigator.modelContext` still works but is deprecated in
 *     Chromium 150+. Chrome ships it behind a public origin trial (149–156).
 *   · The ChatGPT desktop app's built-in browser and ChatGPT Sites speak WebMCP
 *     since 2026-08-25, so a page that registers correctly is usable from a
 *     ChatGPT conversation without any extension.
 *   · Registration is `registerTool(tool, { signal })` returning a Promise and
 *     rejecting on a duplicate name or an invalid schema — not a synchronous
 *     `{ unregister }` object, which is what most tutorials show.
 */

/* ------------------------------------------------------------------ types */

export type JsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: readonly string[];
  [key: string]: unknown;
};

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  untrustedContentHint?: boolean;
};

export type ExecuteOptions = { signal?: AbortSignal };

export type ToolExecute = (
  input: Record<string, unknown>,
  options?: ExecuteOptions,
) => unknown | Promise<unknown>;

/** What a page declares. */
export type ToolDefinition = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
  execute: ToolExecute;
};

/** What an agent reads back. */
export type RegisteredTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: ToolAnnotations;
  origin: string;
  destructive: boolean;
};

export type ModelContextLike = {
  registerTool: (tool: unknown, options?: unknown) => unknown;
  getTools?: (options?: unknown) => unknown;
  executeTool?: (tool: unknown, input?: unknown, options?: unknown) => unknown;
  callTool?: (name: string, input?: unknown) => unknown;
  tools?: () => unknown;
  clearContext?: () => void;
  ontoolchange?: ((event: unknown) => void) | null;
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
};

export type SurfaceKind = "document" | "navigator" | "polyfill" | "none";

export type Surface = {
  kind: SurfaceKind;
  context: ModelContextLike | null;
  /** True when SENTINEL installed its own context because the browser has none. */
  polyfilled: boolean;
  /** A real agent (ChatGPT, Chrome's browser agent) can only see native tools. */
  agentVisible: boolean;
  reason: string;
};

export const POLYFILL_MARKER = "__sentinelWebMcpPolyfill";

/* -------------------------------------------------- definition validation */

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/** Returns a list of human-readable problems; empty means the tool is valid. */
export function validateToolDefinition(definition: unknown): string[] {
  const problems: string[] = [];
  if (typeof definition !== "object" || definition === null) {
    return ["tool definition must be an object"];
  }
  const tool = definition as Record<string, unknown>;

  if (typeof tool.name !== "string" || tool.name.length === 0) {
    problems.push("name must be a non-empty string");
  } else if (!NAME_PATTERN.test(tool.name)) {
    problems.push("name must match [A-Za-z0-9][A-Za-z0-9_.:-]{0,127}");
  }

  if (typeof tool.description !== "string" || tool.description.trim().length === 0) {
    problems.push("description must be a non-empty string");
  }
  if (tool.title !== undefined && typeof tool.title !== "string") {
    problems.push("title must be a string when present");
  }
  if (typeof tool.execute !== "function") {
    problems.push("execute must be a function");
  }

  const schema = tool.inputSchema;
  if (schema !== undefined) {
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
      problems.push("inputSchema must be a JSON Schema object");
    } else {
      const jsonSchema = schema as JsonSchema;
      if (jsonSchema.type !== undefined && jsonSchema.type !== "object") {
        problems.push("inputSchema.type must be \"object\"");
      }
      if (jsonSchema.properties !== undefined && (typeof jsonSchema.properties !== "object" || jsonSchema.properties === null)) {
        problems.push("inputSchema.properties must be an object");
      }
      if (jsonSchema.required !== undefined) {
        if (!Array.isArray(jsonSchema.required) || jsonSchema.required.some((r) => typeof r !== "string")) {
          problems.push("inputSchema.required must be an array of strings");
        }
      }
    }
  }

  const annotations = tool.annotations;
  if (annotations !== undefined) {
    if (typeof annotations !== "object" || annotations === null) {
      problems.push("annotations must be an object");
    } else {
      for (const [key, value] of Object.entries(annotations as Record<string, unknown>)) {
        if (typeof value !== "boolean") problems.push(`annotations.${key} must be a boolean`);
      }
    }
  }
  return problems;
}

/** Minimal JSON Schema validation — enough to give an agent a useful error. */
export function validateInput(schema: JsonSchema | undefined, value: unknown): string[] {
  const problems: string[] = [];
  if (schema === undefined || schema.properties === undefined) return problems;

  const input = (typeof value === "object" && value !== null && !Array.isArray(value))
    ? value as Record<string, unknown>
    : null;
  if (input === null) {
    return ["input must be an object"];
  }

  for (const key of schema.required ?? []) {
    if (input[key] === undefined || input[key] === null) {
      problems.push(`missing required property "${key}"`);
    }
  }

  const declared = schema.properties;
  for (const [key, actual] of Object.entries(input)) {
    const rule = declared[key] as { type?: string; enum?: readonly unknown[] } | undefined;
    if (rule === undefined) {
      problems.push(`unknown property "${key}" (declared: ${Object.keys(declared).join(", ") || "none"})`);
      continue;
    }
    if (rule.type === "string" && typeof actual !== "string") problems.push(`"${key}" must be a string`);
    if (rule.type === "number" && typeof actual !== "number") problems.push(`"${key}" must be a number`);
    if (rule.type === "integer" && !(typeof actual === "number" && Number.isFinite(actual))) problems.push(`"${key}" must be an integer`);
    if (rule.type === "boolean" && typeof actual !== "boolean") problems.push(`"${key}" must be a boolean`);
    if (rule.type === "array" && !Array.isArray(actual)) problems.push(`"${key}" must be an array`);
    if (rule.type === "object" && (typeof actual !== "object" || actual === null)) problems.push(`"${key}" must be an object`);
    if (rule.enum !== undefined && !rule.enum.includes(actual)) {
      problems.push(`"${key}" must be one of ${rule.enum.map((v) => JSON.stringify(v)).join(" | ")}`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------ the polyfill */

type ChangeListener = (event: { type: string; timestamp: number }) => void;

/**
 * A spec-shaped Model Context for browsers (and Node) without a native one.
 *
 * It faithfully mirrors `document.modelContext`: promise-returning
 * registration that rejects on duplicates, `getTools`, `executeTool` that
 * stringifies like the spec, `clearContext`, and a `toolchange` event.
 * It is explicitly NOT agent-visible — an in-page bridge only — so the UI must
 * never claim otherwise.
 */
export function createPolyfillContext(origin = "in-page"): ModelContextLike & Record<string, unknown> {
  const tools = new Map<string, ToolDefinition>();
  const listeners = new Set<ChangeListener>();
  let ontoolchange: ChangeListener | null = null;

  const fire = () => {
    const event = { type: "toolchange", timestamp: Date.now() };
    ontoolchange?.(event);
    for (const listener of listeners) listener(event);
  };

  const context = {
    [POLYFILL_MARKER]: true,

    registerTool(definition: unknown, options?: { signal?: AbortSignal }) {
      const problems = validateToolDefinition(definition);
      const tool = definition as ToolDefinition;
      return Promise.resolve().then(() => {
        if (problems.length > 0) {
          throw new TypeError(`invalid tool definition: ${problems.join("; ")}`);
        }
        if (tools.has(tool.name)) {
          throw new Error(`a tool named "${tool.name}" is already registered`);
        }
        tools.set(tool.name, tool);
        fire();
        const unregister = () => {
          if (tools.get(tool.name) === tool) {
            tools.delete(tool.name);
            fire();
          }
        };
        if (options?.signal !== undefined) {
          if (options.signal.aborted) unregister();
          else options.signal.addEventListener("abort", unregister, { once: true });
        }
        // The spec resolves the registration promise with no value; an invalid
        // or duplicate definition rejects it.
        return undefined;
      });
    },

    getTools() {
      return Promise.resolve(listRegistered(tools, origin));
    },

    tools() {
      return Promise.resolve(listRegistered(tools, origin));
    },

    executeTool(tool: unknown, input?: unknown, execOptions?: { signal?: AbortSignal }) {
      const name = typeof tool === "string" ? tool : (tool as { name?: string })?.name ?? "";
      return invoke(name, input, execOptions).then((value) => stringifyResult(value));
    },

    /** Non-spec convenience used by in-page agents and the console: structured, not stringified. */
    callTool(name: string, input?: unknown) {
      return invoke(name, input);
    },

    clearContext() {
      tools.clear();
      fire();
    },

    addEventListener(_type: string, listener: ChangeListener) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: ChangeListener) {
      listeners.delete(listener);
    },
    get ontoolchange() {
      return ontoolchange;
    },
    set ontoolchange(value: ChangeListener | null) {
      ontoolchange = value;
    },
  };

  function invoke(name: string, input: unknown, execOptions?: { signal?: AbortSignal }): Promise<unknown> {
    return Promise.resolve().then(async () => {
      const tool = tools.get(name);
      if (tool === undefined) throw new Error(`unknown tool "${name}"`);
      const problems = validateInput(tool.inputSchema, input ?? {});
      if (problems.length > 0) {
        throw new TypeError(`invalid input for "${name}": ${problems.join("; ")}`);
      }
      return tool.execute((input ?? {}) as Record<string, unknown>, { signal: execOptions?.signal });
    });
  }

  return context as ModelContextLike & Record<string, unknown>;
}

function listRegistered(tools: Map<string, ToolDefinition>, origin: string): RegisteredTool[] {
  return [...tools.values()].map((tool) => ({
    name: tool.name,
    ...(tool.title !== undefined ? { title: tool.title } : {}),
    description: tool.description,
    inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
    annotations: tool.annotations ?? {},
    origin,
    destructive: tool.annotations?.destructiveHint === true,
  }));
}

/** The spec hands agents a stringified result; keep objects readable in the UI. */
export function stringifyResult(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* --------------------------------------------------------- surface access */

function hasRegisterTool(candidate: unknown): candidate is ModelContextLike {
  return (
    typeof candidate === "object"
    && candidate !== null
    && typeof (candidate as ModelContextLike).registerTool === "function"
  );
}

/**
 * Find the model context to register against, preferring the canonical
 * `document.modelContext`, then the deprecated `navigator.modelContext` alias,
 * then falling back to the in-page polyfill.
 */
export function resolveSurface(doc: unknown, nav: unknown, opts: { allowPolyfill?: boolean } = {}): Surface {
  const allowPolyfill = opts.allowPolyfill !== false;

  // Our own polyfill is spec-shaped, but it is still ours: a page script that
  // finds it must not mistake it for a browser surface an agent can see.
  const isOurs = (candidate: unknown) =>
    typeof candidate === "object" && candidate !== null && (candidate as Record<string, unknown>)[POLYFILL_MARKER] === true;

  const docContext = (doc as { modelContext?: unknown } | null)?.modelContext;
  if (hasRegisterTool(docContext)) {
    return isOurs(docContext)
      ? {
          kind: "polyfill",
          context: docContext as ModelContextLike,
          polyfilled: true,
          agentVisible: false,
          reason: "in-page polyfill on document.modelContext — visible to page scripts, not to an external agent",
        }
      : {
          kind: "document",
          context: docContext as ModelContextLike,
          polyfilled: false,
          agentVisible: true,
          reason: "native document.modelContext (canonical WebMCP surface)",
        };
  }
  const navContext = (nav as { modelContext?: unknown } | null)?.modelContext;
  if (hasRegisterTool(navContext)) {
    return isOurs(navContext)
      ? {
          kind: "polyfill",
          context: navContext as ModelContextLike,
          polyfilled: true,
          agentVisible: false,
          reason: "in-page polyfill on navigator.modelContext — visible to page scripts, not to an external agent",
        }
      : {
          kind: "navigator",
          context: navContext as ModelContextLike,
          polyfilled: false,
          agentVisible: true,
          reason: "native navigator.modelContext (deprecated alias, Chromium <150)",
        };
  }
  if (allowPolyfill) {
    return {
      kind: "polyfill",
      context: createPolyfillContext(),
      polyfilled: true,
      agentVisible: false,
      reason: "no native modelContext in this browser — in-page polyfill only",
    };
  }
  return { kind: "none", context: null, polyfilled: false, agentVisible: false, reason: "no modelContext available" };
}

/**
 * Attach the polyfill to `document` (and `navigator`, so agents probing the
 * deprecated name find the same tools) without clobbering a native surface.
 */
export function installPolyfill(doc: Record<string, unknown>, nav: Record<string, unknown> | null): boolean {
  if (hasRegisterTool(doc.modelContext)) return false;
  const context = createPolyfillContext();
  try {
    Object.defineProperty(doc, "modelContext", { value: context, configurable: true, writable: true });
  } catch {
    try {
      doc.modelContext = context;
    } catch {
      return false;
    }
  }
  // Agents written before the May 2026 spec move probe `navigator.modelContext`;
  // point it at the very same context so both names agree.
  if (nav !== null && !hasRegisterTool(nav.modelContext)) {
    try {
      Object.defineProperty(nav, "modelContext", { value: context, configurable: true, writable: true });
    } catch {
      /* navigator is sealed in some engines; document alone is enough */
    }
  }
  return true;
}

/* ------------------------------------------------------------- registration */

export type RegistrationResult = {
  registered: string[];
  failed: { name: string; reason: string }[];
};

/**
 * Register definitions on a context, tolerating every shape seen in the wild:
 * native promise-returning `registerTool`, the older `{ unregister }` object,
 * and per-tool rejection (a duplicate must not take the whole catalog down).
 */
export async function registerTools(
  context: ModelContextLike,
  definitions: readonly ToolDefinition[],
  options: { signal?: AbortSignal; replace?: boolean } = {},
): Promise<RegistrationResult> {
  if (options.replace === true && typeof context.clearContext === "function") {
    context.clearContext();
  }

  const registered: string[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const definition of definitions) {
    const problems = validateToolDefinition(definition);
    if (problems.length > 0) {
      failed.push({ name: definition?.name ?? "(unnamed)", reason: problems.join("; ") });
      continue;
    }
    try {
      const outcome = await Promise.resolve(
        context.registerTool(
          {
            name: definition.name,
            ...(definition.title !== undefined ? { title: definition.title } : {}),
            description: definition.description,
            inputSchema: definition.inputSchema ?? { type: "object", properties: {} },
            annotations: definition.annotations ?? {},
            execute: definition.execute,
          },
          options.signal === undefined ? undefined : { signal: options.signal },
        ),
      );
      // Some implementations returned an object with unregister() instead of a
      // promise; awaiting it is a no-op, so treat any outcome as success.
      void outcome;
      registered.push(definition.name);
    } catch (cause) {
      failed.push({ name: definition.name, reason: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return { registered, failed };
}

/** Read the tool list back off a context, whatever shape it exposes. */
export async function listTools(context: ModelContextLike | null): Promise<RegisteredTool[]> {
  if (context === null) return [];
  try {
    const raw = typeof context.getTools === "function"
      ? await Promise.resolve(context.getTools({}))
      : typeof context.tools === "function"
        ? await Promise.resolve(context.tools())
        : [];
    const list = Array.isArray(raw) ? raw : [];
    return list.map((entry) => {
      const tool = entry as {
        name?: string; title?: string; description?: string;
        inputSchema?: JsonSchema | string; annotations?: ToolAnnotations; origin?: string;
      };
      const annotations = tool.annotations ?? {};
      return {
        name: tool.name ?? "(unnamed)",
        ...(tool.title !== undefined ? { title: tool.title } : {}),
        description: tool.description ?? "",
        inputSchema: typeof tool.inputSchema === "string" ? safeParseSchema(tool.inputSchema) : tool.inputSchema ?? {},
        annotations,
        origin: tool.origin ?? "unknown",
        destructive: annotations.destructiveHint === true,
      };
    });
  } catch {
    return [];
  }
}

function safeParseSchema(raw: string): JsonSchema {
  try {
    return JSON.parse(raw) as JsonSchema;
  } catch {
    return {};
  }
}

/** Invoke by name through the context, using whichever entry point it offers. */
export async function invokeTool(
  context: ModelContextLike | null,
  name: string,
  input: Record<string, unknown> = {},
  options: { raw?: boolean } = {},
): Promise<unknown> {
  if (context === null) throw new Error("no modelContext available");
  if (options.raw !== false && typeof context.callTool === "function") {
    return Promise.resolve(context.callTool(name, input));
  }
  if (typeof context.executeTool === "function") {
    return Promise.resolve(context.executeTool(name, input));
  }
  throw new Error("this modelContext cannot execute tools");
}
