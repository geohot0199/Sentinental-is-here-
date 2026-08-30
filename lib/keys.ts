"use client";

/**
 * The key vault — the browser-side twin of `.env`.
 *
 * Keys live in localStorage on the operator's machine, are read in exactly
 * this one place, are masked everywhere they are displayed, and are sent only
 * to THIS app's own API routes over HTTPS — never to a third party, never
 * persisted server-side. Clearing the vault clears them entirely.
 */

export interface KeyVault {
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  MODEL_PROVIDER: string; // "" | openai | anthropic | google-gemini
  MODEL_ID: string;
  GITHUB_TOKEN: string;
  SENTINEL_TARGET_REPO: string;
  DAYTONA_API_KEY: string;
  SENTINEL_ALLOW_REMOTE_WRITES: boolean;
  TRUEFORGE_URL: string;
}

export const EMPTY_VAULT: KeyVault = {
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  GEMINI_API_KEY: "",
  MODEL_PROVIDER: "",
  MODEL_ID: "",
  GITHUB_TOKEN: "",
  SENTINEL_TARGET_REPO: "",
  DAYTONA_API_KEY: "",
  SENTINEL_ALLOW_REMOTE_WRITES: true,
  TRUEFORGE_URL: "",
};

const STORAGE_KEY = "sentinel.vault.v1";

export function loadVault(): KeyVault {
  if (typeof window === "undefined") return { ...EMPTY_VAULT };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...EMPTY_VAULT };
    const parsed = JSON.parse(raw) as Partial<KeyVault>;
    return { ...EMPTY_VAULT, ...parsed };
  } catch {
    return { ...EMPTY_VAULT };
  }
}

export function saveVault(vault: KeyVault): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
}

export function clearVault(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Which provider key wins, in the SENTINEL order. */
export function activeProvider(vault: KeyVault): "openai" | "anthropic" | "google-gemini" | null {
  if (vault.MODEL_PROVIDER === "openai") return "openai";
  if (vault.MODEL_PROVIDER === "anthropic") return "anthropic";
  if (vault.MODEL_PROVIDER === "google-gemini") return "google-gemini";
  if (vault.OPENAI_API_KEY) return "openai";
  if (vault.ANTHROPIC_API_KEY) return "anthropic";
  if (vault.GEMINI_API_KEY) return "google-gemini";
  return null;
}

/** Mask a secret for display: first 4 and last 4 characters at most. */
export function maskSecret(value: string): string {
  if (value.length === 0) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(Math.min(18, value.length - 8))}${value.slice(-4)}`;
}

export interface Capabilities {
  model: string | null;
  github: boolean;
  sandbox: boolean;
  remoteWrites: boolean;
  targetRepo: string | null;
  harnessUrl: string | null;
  notes: string[];
}

/** The browser-side capability report, merged with the server's /api/status. */
export function describeCapabilities(vault: KeyVault, serverRemoteWrites: boolean | null): Capabilities {
  const provider = activeProvider(vault);
  const notes: string[] = [];

  if (provider === null) {
    notes.push("No model key. The scripted model runs the whole path — real advisory data, real tools, real gate — without spending anything.");
  } else {
    notes.push(`Model provider: ${provider}${vault.MODEL_ID ? ` (${vault.MODEL_ID})` : ""} — picked from the harness catalog.`);
  }
  if (!vault.GITHUB_TOKEN) {
    notes.push("No GitHub token. Public advisory triage still works; private repos and pull requests need GITHUB_TOKEN.");
  }
  if (!vault.DAYTONA_API_KEY) {
    notes.push("No Daytona sandbox key. Patch verification runs in demo mode and is reported UNVERIFIED — never silently claimed.");
  }
  if (!vault.SENTINEL_ALLOW_REMOTE_WRITES) {
    notes.push("Kill switch OFF: destructive tools refuse before any network call.");
  }
  if (serverRemoteWrites === false) {
    notes.push("Server kill switch OFF: the API refuses remote writes regardless of the browser.");
  }

  return {
    model: provider,
    github: vault.GITHUB_TOKEN.length > 0,
    sandbox: vault.DAYTONA_API_KEY.length > 0,
    remoteWrites: vault.SENTINEL_ALLOW_REMOTE_WRITES && serverRemoteWrites !== false,
    targetRepo: vault.SENTINEL_TARGET_REPO || null,
    harnessUrl: vault.TRUEFORGE_URL || null,
    notes,
  };
}
