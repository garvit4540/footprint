import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, weightsApi, Weight } from "../api/client";
import { useAuth } from "../AuthContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

export default function WeightPage() {
  const qc = useQueryClient();
  const { user, refresh } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["weights"], queryFn: weightsApi.list });

  const entries = data || [];
  const sorted = useMemo(
    () => entries.slice().sort((a, b) => a.recorded_on.localeCompare(b.recorded_on)),
    [entries]
  );
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const change = latest && first ? latest.value_kg - first.value_kg : 0;
  const last30 = useMemo(() => {
    if (sorted.length === 0) return 0;
    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const prior = [...sorted].reverse().find((e) => e.recorded_on < cutoff);
    if (!prior || !latest) return 0;
    return latest.value_kg - prior.value_kg;
  }, [sorted, latest]);

  const heightCm = user?.height_cm ?? null;
  const bmi = latest && heightCm
    ? latest.value_kg / Math.pow(heightCm / 100, 2)
    : null;
  const bmiInfo = bmi != null ? bmiCategory(bmi) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Weight</h1>
        <p className="text-ink-400 text-sm mt-1">Log your weight. One entry per check-in.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Latest" value={latest ? `${latest.value_kg.toFixed(1)} kg` : "—"} sub={latest ? new Date(latest.recorded_on).toLocaleDateString() : ""} />
        <BMICard bmi={bmi} info={bmiInfo} hasHeight={heightCm != null} />
        <Stat label="Since start" value={first && latest ? `${change >= 0 ? "+" : ""}${change.toFixed(1)} kg` : "—"} tone={change > 0 ? "text-rose-300" : change < 0 ? "text-emerald-300" : ""} />
        <Stat label="Last 30 days" value={latest ? `${last30 >= 0 ? "+" : ""}${last30.toFixed(1)} kg` : "—"} tone={last30 > 0 ? "text-rose-300" : last30 < 0 ? "text-emerald-300" : ""} />
      </div>

      <HeightEditor heightCm={heightCm} onSaved={refresh} />

      <AddForm onSaved={() => qc.invalidateQueries({ queryKey: ["weights"] })} />

      <WeightChart sorted={sorted} heightCm={heightCm} first={first} />


      <div className="card p-0">
        <div className="px-5 pt-5"><h3 className="text-lg font-semibold">Entries</h3></div>
        {isLoading ? (
          <p className="px-5 pb-5 text-ink-400">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-5 pb-5 text-ink-400 text-sm">No entries yet.</p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <EntriesTable entries={sorted.slice().reverse()} />
          </div>
        )}
      </div>
    </div>
  );
}

function AddForm({ onSaved }: { onSaved: () => void }) {
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => weightsApi.add({
      value_kg: parseFloat(kg),
      recorded_on: date || null,
      notes: notes || null,
    }),
    onSuccess: () => {
      setKg(""); setNotes(""); setErr(null);
      onSaved();
    },
    onError: (e: any) => setErr(e?.message || "failed"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!(parseFloat(kg) > 0)) { setErr("enter a weight"); return; }
    add.mutate();
  };

  return (
    <form onSubmit={submit} className="card">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 flex-1 min-w-[140px]">
          <div className="field-label">Weight (kg)</div>
          <input className="input" type="number" step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 72.4" autoFocus />
        </label>
        <label className="space-y-1">
          <div className="field-label">Date</div>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="space-y-1 flex-1 min-w-[200px]">
          <div className="field-label">Notes (optional)</div>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="morning, after gym…" />
        </label>
        <button className="btn" type="submit" disabled={add.isPending}>
          {add.isPending ? "Saving…" : "Log"}
        </button>
      </div>
      {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
    </form>
  );
}

function EntriesTable({ entries }: { entries: Weight[] }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: number) => weightsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weights"] }),
  });
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-900/60">
        <tr>
          <th className="px-4 py-3">Date</th>
          <th className="px-4 py-3">Weight</th>
          <th className="px-4 py-3">Change</th>
          <th className="px-4 py-3">Notes</th>
          <th className="px-4 py-3 text-right" />
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-800">
        {entries.map((e, idx, arr) => {
          const prev = arr[idx + 1]?.value_kg;
          const diff = prev != null ? e.value_kg - prev : null;
          const tone = diff == null ? "text-ink-500" : diff > 0 ? "text-rose-300" : diff < 0 ? "text-emerald-300" : "text-ink-300";
          return (
            <tr key={e.id} className="hover:bg-ink-900/60">
              <td className="px-4 py-3 text-ink-300">{new Date(e.recorded_on).toLocaleDateString()}</td>
              <td className="px-4 py-3 font-medium">{e.value_kg.toFixed(1)} kg</td>
              <td className={`px-4 py-3 ${tone}`}>
                {diff == null ? "—" : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} kg`}
              </td>
              <td className="px-4 py-3 text-ink-400">{e.notes || ""}</td>
              <td className="px-4 py-3 text-right">
                <button
                  className="btn-ghost text-xs"
                  onClick={() => { if (confirm("Remove this entry?")) del.mutate(e.id); }}
                >
                  Remove
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type SortedEntry = Weight;

function linearTrend(points: { t: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) { sx += p.t; sy += p.y; sxx += p.t * p.t; sxy += p.t * p.y; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function WeightChart({
  sorted, heightCm, first,
}: { sorted: SortedEntry[]; heightCm: number | null; first: SortedEntry | undefined }) {
  const hasBMI = heightCm != null && heightCm > 0;
  const toBmi = (kg: number) => hasBMI ? kg / Math.pow((heightCm as number) / 100, 2) : 0;

  const tsOf = (d: string) => new Date(d).getTime();
  const trendPts = sorted.map((e) => ({ t: tsOf(e.recorded_on), y: e.value_kg }));
  const fit = linearTrend(trendPts);

  const chartData = sorted.map((e) => {
    const t = tsOf(e.recorded_on);
    const trend = fit ? fit.slope * t + fit.intercept : null;
    return {
      date: e.recorded_on,
      kg: e.value_kg,
      bmi: hasBMI ? Number(toBmi(e.value_kg).toFixed(2)) : null,
      trend: trend != null ? Number(trend.toFixed(2)) : null,
    };
  });

  // Weekly projection per slope for the caption
  const weeklyChange = fit ? fit.slope * 7 * 24 * 3600 * 1000 : 0;
  const trendTone = weeklyChange > 0 ? "text-rose-300" : weeklyChange < 0 ? "text-emerald-300" : "text-ink-300";

  return (
    <div className="card">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h3 className="text-lg font-semibold">Over time</h3>
          {fit && (
            <p className={`text-sm ${trendTone}`}>
              Trend: {weeklyChange >= 0 ? "+" : ""}{weeklyChange.toFixed(2)} kg / week
              {hasBMI && <span className="text-ink-400"> · BMI overlaid on right axis</span>}
            </p>
          )}
          {!fit && <p className="text-sm text-ink-400">Log two or more entries to see the trend.</p>}
        </div>
      </div>
      {sorted.length < 2 ? (
        <p className="text-ink-400 text-sm">Add two or more entries to see the curve.</p>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" stroke="#9ca3af" minTickGap={40} />
              <YAxis
                yAxisId="kg"
                stroke="#9ca3af"
                domain={["dataMin - 1", "dataMax + 1"]}
                tickFormatter={(v) => `${v}kg`}
              />
              {hasBMI && (
                <YAxis
                  yAxisId="bmi"
                  orientation="right"
                  stroke="#f472b6"
                  domain={["dataMin - 0.5", "dataMax + 0.5"]}
                  tickFormatter={(v) => v.toFixed(1)}
                />
              )}
              <Tooltip
                formatter={(v: number, name: string) => {
                  if (name === "Weight") return [`${v.toFixed(1)} kg`, name];
                  if (name === "BMI")    return [v.toFixed(1), name];
                  if (name === "Trend")  return [`${v.toFixed(1)} kg`, name];
                  return [v, name];
                }}
                contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8 }}
                labelStyle={{ color: "#cbd5e1" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {first && (
                <ReferenceLine
                  yAxisId="kg"
                  y={first.value_kg}
                  stroke="#6b7280"
                  strokeDasharray="4 4"
                  label={{ value: "start", fill: "#94a3b8", fontSize: 11, position: "right" }}
                />
              )}
              <Line
                yAxisId="kg"
                type="monotone"
                dataKey="kg"
                name="Weight"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
              {fit && (
                <Line
                  yAxisId="kg"
                  type="linear"
                  dataKey="trend"
                  name="Trend"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              {hasBMI && (
                <Line
                  yAxisId="bmi"
                  type="monotone"
                  dataKey="bmi"
                  name="BMI"
                  stroke="#f472b6"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card">
      <div className="field-label">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tone || "text-white"}`}>{value}</div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}

type BMICat = { label: string; tone: string; bar: string };

function bmiCategory(bmi: number): BMICat {
  if (bmi < 18.5) return { label: "Underweight", tone: "text-amber-300", bar: "bg-amber-400" };
  if (bmi < 25)   return { label: "Normal",      tone: "text-emerald-300", bar: "bg-emerald-400" };
  if (bmi < 30)   return { label: "Overweight",  tone: "text-amber-300", bar: "bg-amber-400" };
  return { label: "Obese", tone: "text-rose-300", bar: "bg-rose-400" };
}

function BMICard({ bmi, info, hasHeight }: { bmi: number | null; info: BMICat | null; hasHeight: boolean }) {
  if (!hasHeight) {
    return (
      <div className="card">
        <div className="field-label">BMI</div>
        <div className="text-ink-400 text-sm mt-2">
          Set your height below to see BMI.
        </div>
      </div>
    );
  }
  if (bmi == null || info == null) {
    return (
      <div className="card">
        <div className="field-label">BMI</div>
        <div className="text-ink-400 text-sm mt-2">Log a weight to see your BMI.</div>
      </div>
    );
  }
  // normalize to a 15..40 range for the visualisation bar
  const pct = Math.max(0, Math.min(100, ((bmi - 15) / (40 - 15)) * 100));
  return (
    <div className="card">
      <div className="field-label">BMI</div>
      <div className={`text-2xl font-semibold mt-1 ${info.tone}`}>
        {bmi.toFixed(1)}
        <span className="text-xs text-ink-400 ml-2 font-normal">{info.label}</span>
      </div>
      <div className="relative h-1.5 mt-3 rounded-full bg-ink-800 overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 via-emerald-400 via-60% to-rose-400 opacity-30 w-full" />
        <div className="absolute top-0 bottom-0 w-[2px] bg-white" style={{ left: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-ink-500 mt-1">
        <span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span>
      </div>
    </div>
  );
}

function HeightEditor({ heightCm, onSaved }: { heightCm: number | null; onSaved: () => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(heightCm ? String(heightCm) : "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(heightCm ? String(heightCm) : "");
  }, [heightCm]);

  const save = useMutation({
    mutationFn: () => authApi.updateMe({ height_cm: parseFloat(value) }),
    onSuccess: async () => {
      await onSaved();
      setEditing(false);
      setErr(null);
    },
    onError: (e: any) => setErr(e?.message || "failed"),
  });

  if (!editing) {
    return (
      <div className="card flex items-center justify-between">
        <div>
          <div className="field-label">Height</div>
          <div className="text-lg font-semibold mt-1">
            {heightCm ? `${heightCm} cm` : <span className="text-ink-400 font-normal">Not set</span>}
          </div>
        </div>
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          {heightCm ? "Edit" : "Set height"}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="space-y-1 flex-1 min-w-[160px]">
          <div className="field-label">Height (cm)</div>
          <input
            className="input"
            type="number"
            step="0.1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 175"
            autoFocus
          />
        </label>
        <button
          className="btn"
          onClick={() => { if (parseFloat(value) > 0) save.mutate(); else setErr("enter a valid height"); }}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button className="btn-ghost" onClick={() => { setEditing(false); setErr(null); }}>Cancel</button>
      </div>
      {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
    </div>
  );
}
