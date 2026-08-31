"use client";

/**
 * The SENTINEL console — one shell, five stations:
 *
 *   Deck   capability report (browser vault + server env, merged)
 *   Scan   live dependency triage against real advisory data
 *   Agent  the eight-stage mission runner with the real approval gate
 *   Labs   the WebMCP OMNI-LAB — five laboratories, seventeen tools
 *   Keys   the API key vault — insertion, masking, live connection tests
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Nav from "@/components/Nav";
import { ToastStack, useToasts } from "@/components/interactive";
import Radar from "@/components/motion/Radar";
import Deck from "@/components/console/Deck";
import ScanView from "@/components/console/ScanView";
import AgentCockpit from "@/components/console/AgentCockpit";
import Labs from "@/components/console/Labs";
import KeysPanel from "@/components/console/KeysPanel";
import { loadVault, saveVault, clearVault, type KeyVault } from "@/lib/keys";
import { bootWebMcp } from "@/lib/webmcp";

export interface ServerStatus {
  model: string | null;
  github: boolean;
  sandbox: boolean;
  remoteWrites: boolean;
  harnessUrl: string | null;
  serverKillSwitch: "on" | "off";
  advisorySource: string;
  notes: string[];
}

type TabId = "deck" | "scan" | "agent" | "labs" | "keys";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "deck", label: "Deck", hint: "capability report" },
  { id: "scan", label: "Scan", hint: "live triage" },
  { id: "agent", label: "Agent", hint: "eight-stage mission" },
  { id: "labs", label: "OMNI-LAB", hint: "five laboratories" },
  { id: "keys", label: "Keys", hint: "API key vault" },
];

export default function ConsolePage() {
  const [tab, setTab] = useState<TabId>("deck");
  const [vault, setVault] = useState<KeyVault | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [webmcp, setWebmcp] = useState<{ registeredCount: number; polyfilled: boolean } | null>(null);
  const { toasts, push } = useToasts();

  useEffect(() => {
    setVault(loadVault());
    fetch("/api/status")
      .then((response) => response.json())
      .then((data: ServerStatus) => setServer(data))
      .catch(() => setServer(null));
    try {
      const registration = bootWebMcp();
      setWebmcp({ registeredCount: registration.registeredCount, polyfilled: registration.polyfilled });
    } catch {
      setWebmcp(null);
    }
  }, []);

  const updateVault = useCallback(
    (next: KeyVault) => {
      setVault(next);
      saveVault(next);
    },
    [],
  );

  const wipeVault = useCallback(() => {
    clearVault();
    setVault(loadVault());
    push("Vault cleared. Keys removed from this browser.", "alert");
  }, [push]);

  if (vault === null) {
    return (
      <>
        <Nav />
        <main className="container" style={{ paddingTop: "calc(var(--nav-h) + 80px)", paddingBottom: 80 }}>
          <div className="skeleton" style={{ height: 22, width: 220, marginBottom: 18 }} />
          <div className="skeleton" style={{ height: 320, borderRadius: 8 }} />
        </main>
      </>
    );
  }

  const context = { vault, server, webmcp, updateVault, wipeVault, push };

  return (
    <>
      <Nav />
      <main className="container" style={{ paddingTop: "calc(var(--nav-h) + 30px)", paddingBottom: 70 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22 }}>
          <div className="row" style={{ gap: 18, alignItems: "center", flexWrap: "nowrap" }}>
            <Radar
              size={50}
              contacts={[
                { top: 32, left: 64, delay: 0 },
                { top: 66, left: 38, delay: 1.2, green: true },
              ]}
            />
            <div>
              <span className="kicker">Console</span>
              <h1 className="display" style={{ fontSize: "clamp(26px, 3.6vw, 36px)", fontWeight: 600, letterSpacing: "-0.028em", margin: "6px 0 0" }}>
                Mission control
              </h1>
            </div>
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className={`chip ${server === null ? "" : "chip-green"}`}>
              <span className="dot" style={{ width: 6, height: 6 }} />
              {server === null ? "server…" : "server online"}
            </span>
            <span className="chip">{webmcp === null ? "webmcp…" : `${webmcp.registeredCount} webmcp tools`}</span>
            <button
              className="chip chip-solid"
              style={{ cursor: "pointer" }}
              onClick={() => setTab("keys")}
            >
              ⚿ Insert API keys
            </button>
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: 24 }}>
          {TABS.map((item, index) => (
            <button
              key={item.id}
              className="tab"
              data-active={tab === item.id}
              onClick={() => setTab(item.id)}
              title={item.hint}
              style={{ "--i": index } as CSSProperties}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="station-entry" key={tab}>
          {tab === "deck" && <Deck context={context} onNavigate={setTab} />}
          {tab === "scan" && <ScanView context={context} />}
          {tab === "agent" && <AgentCockpit context={context} />}
          {tab === "labs" && <Labs context={context} />}
          {tab === "keys" && <KeysPanel context={context} />}
        </div>
      </main>
      <ToastStack toasts={toasts} />
    </>
  );
}

export type ConsoleContext = {
  vault: KeyVault;
  server: ServerStatus | null;
  webmcp: { registeredCount: number; polyfilled: boolean } | null;
  updateVault: (next: KeyVault) => void;
  wipeVault: () => void;
  push: (text: string, level?: "ok" | "warn" | "alert") => void;
};
