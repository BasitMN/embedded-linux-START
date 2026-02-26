import { useState, useRef, useCallback, useEffect } from "react";

// ─── DATA ──────────────────────────────────────────────────────────────────────
const SNIPPETS = [
  { id: "navigate",  label: "Navigate",        group: "project", defaultGoal: 10,  code: `cd ~\ncd ws\ncd iot` },
  { id: "setup",     label: "Setup dirs",       group: "project", defaultGoal: 15,  code: `mkdir -p src/iot && touch src/iot/__init__.py` },
  { id: "pyproject", label: "pyproject.toml",   group: "project", defaultGoal: 90,  code: `cat > pyproject.toml << EOF\n[project]\nname = "iot"\nversion = "0.1.0"\ndescription = "Add your description here"\nreadme = "README.md"\nauthors = [\n    { name = "IoT dev", email = "iot@example.com" }\n]\nrequires-python = ">=3.11"\ndependencies = []\n[project.scripts]\nhello = "iot:hello"\n[tool.uv.sources]\n[build-system]\nrequires = ["uv_build>=0.10.4,<0.11.0"]\nbuild-backend = "uv_build"\nEOF` },
  { id: "init",      label: "__init__.py",       group: "project", defaultGoal: 20,  code: `cat > ./src/iot/__init__.py << EOF\ndef hello() -> str:\n    return "Hello from iot!"\nEOF` },
];

const DRILLS = [
  { id: "d1", label: "Brackets & quotes",  group: "drill", defaultGoal: 12, code: `["uv_build>=0.10.4,<0.11.0"]` },
  { id: "d2", label: "Dict literal",       group: "drill", defaultGoal: 15, code: `{ name = "IoT dev", email = "iot@example.com" }` },
  { id: "d3", label: "Comparison ops",     group: "drill", defaultGoal: 12, code: `>=3.11\n>=0.10.4,<0.11.0\n>= <= < >` },
  { id: "d4", label: "requires line",      group: "drill", defaultGoal: 15, code: `requires = ["uv_build>=0.10.4,<0.11.0"]` },
  { id: "d5", label: "Author line",        group: "drill", defaultGoal: 18, code: `    { name = "IoT dev", email = "iot@example.com" }` },
  { id: "d6", label: "Mixed specials",     group: "drill", defaultGoal: 30, code: `[project]\nrequires-python = ">=3.11"\nrequires = ["uv_build>=0.10.4,<0.11.0"]` },
];

const ALL_ITEMS = [...SNIPPETS, ...DRILLS];

// ─── HELPERS ───────────────────────────────────────────────────────────────────
const fmt = (ms) => {
  if (!ms && ms !== 0) return "--";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
};

const fmtGoal = (s) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? String(s % 60).padStart(2,"0")+"s" : ""}`;

const initState = () => ({
  goals: Object.fromEntries(ALL_ITEMS.map(s => [s.id, s.defaultGoal])),
  history: Object.fromEntries(ALL_ITEMS.map(s => [s.id, []])),  // [{wpm, accuracy, elapsedMs, ts}]
  fullRunHistory: [],  // [{totalMs, splits:[{id,elapsedMs,wpm,accuracy}]}]
});

// ─── SPARKLINE ─────────────────────────────────────────────────────────────────
function Sparkline({ data, goalMs, w = 80, h = 24 }) {
  if (!data || data.length < 2) return <span className="text-zinc-700 text-xs font-mono">no data</span>;
  const vals = data.map(d => d.elapsedMs);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const lastY = h - ((vals[vals.length - 1] - min) / range) * (h - 4) - 2;
  const goalY = goalMs ? h - ((Math.min(goalMs, max) - min) / range) * (h - 4) - 2 : null;
  return (
    <svg width={w} height={h} className="overflow-visible">
      {goalY !== null && goalY >= 0 && goalY <= h && (
        <line x1={0} y1={goalY} x2={w} y2={goalY} stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,2" opacity="0.5" />
      )}
      <polyline points={pts} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={(vals.length - 1) / (vals.length - 1) * w} cy={lastY} r="2.5" fill="#10b981" />
    </svg>
  );
}

// ─── TYPING ENGINE ─────────────────────────────────────────────────────────────
function TypingSnippet({ snippet, goalMs, onComplete, onSkip }) {
  const [typed, setTyped] = useState("");
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [errors, setErrors] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const target = snippet.code;

  useEffect(() => {
    setTyped(""); setStartTime(null); setElapsed(0); setFinished(false); setErrors(0);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearInterval(timerRef.current);
  }, [snippet.id]);

  useEffect(() => {
    if (startTime && !finished) {
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTime), 100);
    }
    return () => clearInterval(timerRef.current);
  }, [startTime, finished]);

  const handleKey = (e) => {
    if (finished || e.key !== "Tab") return;
    e.preventDefault();
    if (!startTime) setStartTime(Date.now());
    setTyped(t => (t + "    ").slice(0, target.length));
  };

  const handleChange = (e) => {
    if (finished) return;
    const val = e.target.value;
    const t0 = startTime || (val.length > 0 ? Date.now() : null);
    if (!startTime && val.length > 0) setStartTime(t0);
    let errs = errors;
    if (val.length > typed.length && val[val.length - 1] !== target[typed.length]) errs++;
    setErrors(errs);
    const next = val.slice(0, target.length);
    setTyped(next);
    if (next.length >= target.length) {
      clearInterval(timerRef.current);
      setFinished(true);
      const ms = Date.now() - t0;
      setElapsed(ms);
      const wpm = Math.round(target.length / 5 / (ms / 60000));
      const acc = Math.round(((target.length - Math.min(errs, target.length)) / target.length) * 100);
      onComplete({ wpm, accuracy: acc, errors: errs, elapsedMs: ms });
    }
  };

  const progress = (typed.length / target.length) * 100;
  const overGoal = goalMs && elapsed > goalMs && !finished;

  return (
    <div>
      {/* live timer bar */}
      <div className="flex items-center justify-between mb-2">
        <div className={`font-mono text-xl font-bold tabular-nums transition-colors ${overGoal ? "text-red-400" : elapsed > 0 ? "text-amber-400" : "text-zinc-600"}`}>
          {elapsed > 0 ? fmt(elapsed) : "0.0s"}
        </div>
        {goalMs && (
          <div className="text-xs font-mono text-zinc-500">
            mål: <span className={overGoal ? "text-red-400" : "text-amber-300"}>{fmtGoal(goalMs / 1000)}</span>
          </div>
        )}
      </div>

      {goalMs && (
        <div className="mb-3 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ${overGoal ? "bg-red-500" : "bg-amber-500"}`}
            style={{ width: `${Math.min((elapsed / goalMs) * 100, 100)}%` }}
          />
        </div>
      )}

      <div
        className="relative font-mono text-sm leading-7 p-5 rounded-xl bg-zinc-900 border border-zinc-800 cursor-text whitespace-pre overflow-x-auto"
        style={{ borderColor: overGoal ? "rgb(239 68 68 / 0.5)" : finished ? "rgb(16 185 129 / 0.5)" : undefined }}
        onClick={() => inputRef.current?.focus()}
      >
        {target.split("").map((ch, i) => {
          let cls = "text-zinc-600";
          if (i < typed.length) cls = typed[i] === ch ? "text-emerald-400" : "bg-red-500/25 text-red-300";
          else if (i === typed.length) cls = "border-l-2 border-amber-400 text-zinc-100";
          return ch === "\n"
            ? <span key={i}><span className={cls}>↵</span>{"\n"}</span>
            : <span key={i} className={cls}>{ch}</span>;
        })}
        <textarea ref={inputRef} value={typed} onChange={handleChange} onKeyDown={handleKey}
          className="absolute inset-0 opacity-0 w-full h-full resize-none cursor-text"
          spellCheck={false} autoCapitalize="none" autoCorrect="off" autoComplete="off" />
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-100" style={{ width: `${progress}%` }} />
        </div>
        {onSkip && (
          <button onClick={onSkip} className="text-xs text-zinc-600 hover:text-zinc-400 font-mono">skip →</button>
        )}
      </div>
    </div>
  );
}

// ─── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ state, onNav }) {
  const fullPB = state.fullRunHistory.length > 0 ? Math.min(...state.fullRunHistory.map(r => r.totalMs)) : null;
  const fullLast = state.fullRunHistory.length > 0 ? state.fullRunHistory[state.fullRunHistory.length - 1] : null;
  const totalSessions = Object.values(state.history).reduce((a, h) => a + h.length, 0);

  return (
    <div className="space-y-6">
      {/* Hero stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1 font-mono">Full Run PB</div>
          <div className={`text-4xl font-bold font-mono ${fullPB ? "text-emerald-400" : "text-zinc-700"}`}>
            {fullPB ? fmt(fullPB) : "—"}
          </div>
          {fullLast && fullLast.totalMs !== fullPB && (
            <div className="text-xs text-zinc-500 mt-1 font-mono">
              senaste: <span className={fullLast.totalMs <= fullPB ? "text-emerald-400" : "text-red-400"}>{fmt(fullLast.totalMs)}</span>
              <span className="ml-2">{fullLast.totalMs <= fullPB ? "🎯 PB!" : `+${fmt(fullLast.totalMs - fullPB)} från PB`}</span>
            </div>
          )}
          {!fullPB && <div className="text-xs text-zinc-600 mt-1">Kör en Full Run för att sätta ditt första PB</div>}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Sessioner</div>
          <div className="text-4xl font-bold font-mono text-amber-400">{totalSessions}</div>
          <div className="text-xs text-zinc-600 font-mono">runs idag</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "⚡ Quick Run", sub: "Hela flödet direkt", action: "fullrun", accent: "border-amber-600/50 hover:border-amber-500 hover:bg-amber-500/5" },
          { label: "🎯 Goal Training", sub: "Träna mot tidsmål", action: "goal", accent: "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50" },
          { label: "🔧 Free Practice", sub: "Välj fritt", action: "free", accent: "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50" },
        ].map(b => (
          <button key={b.action} onClick={() => onNav(b.action)}
            className={`p-4 rounded-xl border text-left transition-all ${b.accent}`}>
            <div className="font-bold text-sm mb-1">{b.label}</div>
            <div className="text-xs text-zinc-500">{b.sub}</div>
          </button>
        ))}
      </div>

      {/* Per-snippet PB table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Snippet Overview</h2>
          <button onClick={() => onNav("goals")} className="text-xs text-amber-400 hover:text-amber-300 font-mono">sätt mål →</button>
        </div>
        <div className="space-y-1.5">
          <div className="grid font-mono text-xs text-zinc-600 px-3 pb-1" style={{gridTemplateColumns:"1fr 60px 60px 60px 80px"}}>
            <span>snippet</span><span className="text-right">mål</span><span className="text-right">PB</span><span className="text-right">senaste</span><span className="text-right pr-1">trend</span>
          </div>
          {ALL_ITEMS.map(s => {
            const h = state.history[s.id];
            const pb = h.length > 0 ? Math.min(...h.map(r => r.elapsedMs)) : null;
            const last = h.length > 0 ? h[h.length - 1] : null;
            const goalMs = state.goals[s.id] * 1000;
            const pbBeat = pb && pb <= goalMs;
            return (
              <div key={s.id} className="grid items-center bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 font-mono text-sm" style={{gridTemplateColumns:"1fr 60px 60px 60px 80px"}}>
                <span className="text-zinc-300 text-xs">{s.label}</span>
                <span className="text-right text-xs text-zinc-600">{fmtGoal(state.goals[s.id])}</span>
                <span className={`text-right text-xs ${pb ? (pbBeat ? "text-emerald-400" : "text-yellow-400") : "text-zinc-700"}`}>{pb ? fmt(pb) : "—"}</span>
                <span className={`text-right text-xs ${last ? (last.elapsedMs <= goalMs ? "text-emerald-400" : "text-red-400") : "text-zinc-700"}`}>{last ? fmt(last.elapsedMs) : "—"}</span>
                <div className="flex justify-end pr-1">
                  <Sparkline data={h.slice(-10)} goalMs={goalMs} w={72} h={20} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full run history */}
      {state.fullRunHistory.length > 0 && (
        <div>
          <h2 className="text-xs text-zinc-500 uppercase tracking-widest font-mono mb-3">Full Run History</h2>
          <div className="space-y-1.5">
            {state.fullRunHistory.slice(-5).reverse().map((r, i) => (
              <div key={i} className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-sm">
                <span className="text-zinc-600 text-xs mr-3">#{state.fullRunHistory.length - i}</span>
                <span className={`font-bold ${r.totalMs === fullPB ? "text-emerald-400" : "text-zinc-200"}`}>{fmt(r.totalMs)}</span>
                {r.totalMs === fullPB && <span className="ml-2 text-xs text-emerald-500">PB</span>}
                <div className="flex-1 flex justify-end gap-2">
                  {r.splits.map(sp => (
                    <span key={sp.id} className="text-xs text-zinc-600">{fmt(sp.elapsedMs)}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GOAL SETTINGS ─────────────────────────────────────────────────────────────
function GoalSettings({ state, onSave, onBack }) {
  const [goals, setGoals] = useState({ ...state.goals });
  const set = (id, val) => setGoals(g => ({ ...g, [id]: Math.max(5, parseInt(val) || 5) }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <button onClick={onBack} className="text-zinc-500 hover:text-zinc-300 font-mono text-sm">← back</button>
        <h2 className="text-sm font-bold font-mono text-zinc-300">Sätt tidsmål (sekunder)</h2>
      </div>

      {[["Project Snippets", SNIPPETS], ["Special Char Drills", DRILLS]].map(([title, items]) => (
        <div key={title}>
          <div className="text-xs text-zinc-600 uppercase tracking-widest font-mono mb-2">{title}</div>
          <div className="space-y-2">
            {items.map(s => (
              <div key={s.id} className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                <span className="flex-1 font-mono text-sm text-zinc-300">{s.label}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => set(s.id, goals[s.id] - 5)} className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs flex items-center justify-center">−</button>
                  <input
                    type="number" min="5" max="600"
                    value={goals[s.id]}
                    onChange={e => set(s.id, e.target.value)}
                    className="w-16 text-center bg-zinc-800 border border-zinc-700 rounded px-2 py-1 font-mono text-sm text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                  <button onClick={() => set(s.id, goals[s.id] + 5)} className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs flex items-center justify-center">+</button>
                  <span className="text-xs text-zinc-600 font-mono w-8">{fmtGoal(goals[s.id])}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button onClick={() => onSave(goals)} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-sm">
        spara mål
      </button>
    </div>
  );
}

// ─── TRAINING SESSION ──────────────────────────────────────────────────────────
function TrainingSession({ queue, state, mode, onDone, onBack }) {
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState([]);
  const [sessionStart] = useState(Date.now());

  const handleComplete = useCallback((result) => {
    const nr = [...results, { ...result, id: queue[cursor].id, label: queue[cursor].label }];
    setResults(nr);
    if (cursor + 1 < queue.length) {
      setTimeout(() => setCursor(c => c + 1), 400);
    } else {
      const totalMs = Date.now() - sessionStart;
      onDone(nr, totalMs);
    }
  }, [results, queue, cursor, sessionStart, onDone]);

  const handleSkip = () => {
    const nr = [...results, { id: queue[cursor].id, label: queue[cursor].label, wpm: 0, accuracy: 0, errors: 0, elapsedMs: null, skipped: true }];
    setResults(nr);
    if (cursor + 1 < queue.length) setCursor(c => c + 1);
    else { const totalMs = Date.now() - sessionStart; onDone(nr, totalMs); }
  };

  const current = queue[cursor];
  const goalMs = state.goals[current.id] * 1000;
  const prevBest = state.history[current.id].length > 0 ? Math.min(...state.history[current.id].map(r => r.elapsedMs)) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-zinc-600 hover:text-zinc-400 font-mono text-xs">← avbryt</button>
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{mode}</span>
        <span className="text-xs font-mono text-zinc-600">{cursor + 1} / {queue.length}</span>
      </div>

      <div className="flex gap-1.5">
        {queue.map((_, i) => (
          <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i < cursor ? "bg-emerald-500" : i === cursor ? "bg-amber-400" : "bg-zinc-800"}`} />
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono font-bold text-zinc-200">{current.label}</span>
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
            {prevBest && <span>PB: <span className="text-emerald-400">{fmt(prevBest)}</span></span>}
            {results.length > 0 && results[results.length - 1].elapsedMs && (
              <span>senaste: <span className="text-amber-400">{fmt(results[results.length - 1].elapsedMs)}</span></span>
            )}
          </div>
        </div>
      </div>

      <TypingSnippet
        key={`${current.id}-${cursor}`}
        snippet={current}
        goalMs={mode !== "free" ? goalMs : null}
        onComplete={handleComplete}
        onSkip={handleSkip}
      />
      <p className="text-center text-zinc-700 text-xs font-mono">klicka i rutan och börja skriva</p>
    </div>
  );
}

// ─── RESULTS SCREEN ────────────────────────────────────────────────────────────
function ResultsScreen({ results, totalMs, state, mode, onRerun, onDash }) {
  const done = results.filter(r => !r.skipped);
  const avgWpm = done.length > 0 ? Math.round(done.reduce((a, r) => a + r.wpm, 0) / done.length) : 0;
  const avgAcc = done.length > 0 ? Math.round(done.reduce((a, r) => a + r.accuracy, 0) / done.length) : 0;
  const fullPB = state.fullRunHistory.length > 0 ? Math.min(...state.fullRunHistory.map(r => r.totalMs)) : null;
  const isNewPB = mode === "fullrun" && fullPB && totalMs <= fullPB;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-4xl mb-2">{isNewPB ? "🏆" : "🎯"}</div>
        <h2 className="text-xl font-bold font-mono">{isNewPB ? "NEW PB!" : "Session complete"}</h2>
        {mode === "fullrun" && <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{fmt(totalMs)}</div>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[[avgWpm, "avg WPM", "text-amber-400"], [avgAcc + "%", "avg accuracy", "text-emerald-400"], [fmt(totalMs), "total tid", "text-sky-400"]].map(([v, l, c]) => (
          <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold font-mono ${c}`}>{v}</div>
            <div className="text-zinc-600 text-xs mt-1 font-mono">{l}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="grid font-mono text-xs text-zinc-600 px-3 pb-1.5" style={{gridTemplateColumns:"1fr 70px 52px 52px 52px"}}>
          <span>snippet</span><span className="text-right">tid</span><span className="text-right">∆mål</span><span className="text-right">wpm</span><span className="text-right">acc</span>
        </div>
        <div className="space-y-1">
          {results.map((r, i) => {
            const goalMs = state.goals[r.id] * 1000;
            const delta = r.elapsedMs != null ? r.elapsedMs - goalMs : null;
            const beatGoal = delta !== null && delta <= 0;
            const pbMs = state.history[r.id].length > 0 ? Math.min(...state.history[r.id].map(x => x.elapsedMs)) : null;
            const newPb = pbMs && r.elapsedMs <= pbMs;
            return (
              <div key={i} className="grid items-center bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 font-mono text-sm" style={{gridTemplateColumns:"1fr 70px 52px 52px 52px"}}>
                <span className="text-zinc-300 text-xs flex items-center gap-1.5">
                  {r.label}
                  {newPb && !r.skipped && <span className="text-xs text-emerald-500 bg-emerald-500/10 px-1 rounded">PB</span>}
                </span>
                <span className={`text-right text-xs ${r.skipped ? "text-zinc-700" : "text-sky-400"}`}>{r.skipped ? "skip" : fmt(r.elapsedMs)}</span>
                <span className={`text-right text-xs ${r.skipped ? "text-zinc-700" : beatGoal ? "text-emerald-400" : "text-red-400"}`}>
                  {r.skipped ? "—" : delta <= 0 ? fmt(Math.abs(delta)) + " ✓" : "+" + fmt(delta)}
                </span>
                <span className="text-right text-xs text-amber-400">{r.skipped ? "—" : r.wpm}</span>
                <span className={`text-right text-xs ${r.skipped ? "text-zinc-700" : r.accuracy >= 95 ? "text-emerald-400" : r.accuracy >= 80 ? "text-yellow-400" : "text-red-400"}`}>
                  {r.skipped ? "—" : r.accuracy + "%"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onRerun} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-xl text-sm font-mono">↺ igen</button>
        <button onClick={onDash} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-sm font-mono">dashboard →</button>
      </div>
    </div>
  );
}

// ─── FREE PRACTICE SELECTOR ────────────────────────────────────────────────────
function FreeSelector({ onStart, onBack }) {
  const [sel, setSel] = useState(SNIPPETS.map(s => s.id));
  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-500 hover:text-zinc-300 font-mono text-sm">← back</button>
        <h2 className="font-mono font-bold text-zinc-300 text-sm">Free Practice</h2>
      </div>
      {[["Project Snippets", SNIPPETS], ["Special Char Drills", DRILLS]].map(([title, items]) => (
        <div key={title}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-zinc-600 uppercase tracking-widest font-mono">{title}</div>
            <div className="flex gap-3">
              <button onClick={() => setSel(s => [...new Set([...s, ...items.map(x => x.id)])])} className="text-xs text-amber-400 font-mono">alla</button>
              <button onClick={() => setSel(s => s.filter(id => !items.map(x => x.id).includes(id)))} className="text-xs text-zinc-600 font-mono">ingen</button>
            </div>
          </div>
          <div className="space-y-1.5">
            {items.map(s => (
              <button key={s.id} onClick={() => toggle(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left text-sm font-mono transition-all ${sel.includes(s.id) ? "border-emerald-700 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700"}`}>
                <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${sel.includes(s.id) ? "border-emerald-500 bg-emerald-500" : "border-zinc-600"}`}>
                  {sel.includes(s.id) && <span className="text-xs text-black leading-none">✓</span>}
                </span>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button onClick={() => onStart(ALL_ITEMS.filter(s => sel.includes(s.id)))} disabled={sel.length === 0}
        className={`w-full py-3 rounded-xl font-bold text-sm font-mono ${sel.length > 0 ? "bg-amber-500 hover:bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-600 cursor-not-allowed"}`}>
        start →
      </button>
    </div>
  );
}

// ─── GOAL TRAINING SELECTOR ────────────────────────────────────────────────────
function GoalSelector({ state, onStart, onBack }) {
  const [sel, setSel] = useState(SNIPPETS.map(s => s.id));
  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-500 hover:text-zinc-300 font-mono text-sm">← back</button>
        <h2 className="font-mono font-bold text-zinc-300 text-sm">Goal Training</h2>
      </div>
      {[["Project Snippets", SNIPPETS], ["Special Char Drills", DRILLS]].map(([title, items]) => (
        <div key={title}>
          <div className="text-xs text-zinc-600 uppercase tracking-widest font-mono mb-2">{title}</div>
          <div className="space-y-1.5">
            {items.map(s => {
              const h = state.history[s.id];
              const pb = h.length > 0 ? Math.min(...h.map(r => r.elapsedMs)) : null;
              const goalMs = state.goals[s.id] * 1000;
              const beatGoal = pb && pb <= goalMs;
              return (
                <button key={s.id} onClick={() => toggle(s.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left text-sm font-mono transition-all ${sel.includes(s.id) ? "border-emerald-700 bg-emerald-500/10" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}>
                  <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${sel.includes(s.id) ? "border-emerald-500 bg-emerald-500" : "border-zinc-600"}`}>
                    {sel.includes(s.id) && <span className="text-xs text-black leading-none">✓</span>}
                  </span>
                  <span className={`flex-1 ${sel.includes(s.id) ? "text-emerald-300" : "text-zinc-500"}`}>{s.label}</span>
                  <span className="text-xs text-zinc-600">mål: <span className="text-amber-400">{fmtGoal(state.goals[s.id])}</span></span>
                  {pb && <span className={`text-xs ${beatGoal ? "text-emerald-500" : "text-zinc-500"}`}>PB: {fmt(pb)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button onClick={() => onStart(ALL_ITEMS.filter(s => sel.includes(s.id)))} disabled={sel.length === 0}
        className={`w-full py-3 rounded-xl font-bold text-sm font-mono ${sel.length > 0 ? "bg-amber-500 hover:bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-600 cursor-not-allowed"}`}>
        start träning →
      </button>
    </div>
  );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState(initState);
  const [screen, setScreen] = useState("dash");
  const [queue, setQueue] = useState([]);
  const [activeMode, setActiveMode] = useState(null);
  const [lastResults, setLastResults] = useState(null);

  const updateState = useCallback((results, totalMs, mode) => {
    setState(prev => {
      const next = { ...prev, history: { ...prev.history }, goals: { ...prev.goals } };
      results.filter(r => !r.skipped && r.elapsedMs).forEach(r => {
        next.history[r.id] = [...(prev.history[r.id] || []), { wpm: r.wpm, accuracy: r.accuracy, elapsedMs: r.elapsedMs, ts: Date.now() }].slice(-20);
      });
      if (mode === "fullrun" || mode === "goal") {
        next.fullRunHistory = [...prev.fullRunHistory, { totalMs, splits: results.map(r => ({ id: r.id, elapsedMs: r.elapsedMs, wpm: r.wpm, accuracy: r.accuracy })) }];
      }
      return next;
    });
    setLastResults({ results, totalMs });
    setScreen("results");
  }, []);

  const startSession = useCallback((q, mode) => {
    setQueue(q);
    setActiveMode(mode);
    setScreen("training");
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-start p-5 pt-8" style={{fontFamily:"'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"}}>
      {/* scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-50" style={{background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px)"}} />

      <div className="w-full max-w-xl relative z-10">
        {/* header */}
        <div className="mb-7 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight"><span className="text-amber-400">$</span> terminal velocity</h1>
          </div>
          <p className="text-zinc-600 text-xs uppercase tracking-widest">IoT project setup trainer</p>
        </div>

        {screen === "dash" && <Dashboard state={state} onNav={(a) => {
          if (a === "fullrun") startSession(SNIPPETS, "fullrun");
          else if (a === "goal") setScreen("goalsel");
          else if (a === "free") setScreen("freesel");
          else if (a === "goals") setScreen("goaledit");
        }} />}

        {screen === "goaledit" && <GoalSettings state={state} onBack={() => setScreen("dash")} onSave={(goals) => { setState(s => ({ ...s, goals })); setScreen("dash"); }} />}

        {screen === "freesel" && <FreeSelector onBack={() => setScreen("dash")} onStart={(q) => startSession(q, "free")} />}

        {screen === "goalsel" && <GoalSelector state={state} onBack={() => setScreen("dash")} onStart={(q) => startSession(q, "goal")} />}

        {screen === "training" && (
          <TrainingSession
            queue={queue}
            state={state}
            mode={activeMode}
            onDone={(results, totalMs) => updateState(results, totalMs, activeMode)}
            onBack={() => setScreen("dash")}
          />
        )}

        {screen === "results" && lastResults && (
          <ResultsScreen
            results={lastResults.results}
            totalMs={lastResults.totalMs}
            state={state}
            mode={activeMode}
            onRerun={() => { setScreen("training"); }}
            onDash={() => setScreen("dash")}
          />
        )}
      </div>
    </div>
  );
}
