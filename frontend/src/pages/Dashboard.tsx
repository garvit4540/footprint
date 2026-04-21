import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, fmt, InvestmentSeries } from "../api/client";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

const COLORS = [
  "#60a5fa", "#34d399", "#f472b6", "#fbbf24",
  "#a78bfa", "#fb923c", "#4ade80", "#f87171",
  "#22d3ee", "#c084fc",
];

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const [currency, setCurrency] = useState<string>("");

  if (isLoading) return <p className="text-ink-400">Loading…</p>;
  if (error || !data) return <p className="text-red-400">Error loading summary</p>;

  const tone = data.total_gain >= 0 ? "text-accent-emerald" : "text-red-400";

  const currencies = Array.from(new Set(data.series.map((s) => s.currency))).sort();
  const activeCurrency = currency || currencies[0] || "INR";
  const filteredSeries = data.series.filter((s) => s.currency === activeCurrency);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Portfolio</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total invested" value={fmt(data.total_invested)} />
        <Stat label="Current value" value={fmt(data.total_current)} />
        <Stat label="Gain / loss" value={`${fmt(data.total_gain)} (${data.gain_pct.toFixed(2)}%)`} tone={tone} />
      </div>

      <div className="card space-y-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Value over time</h3>
            <p className="text-sm text-ink-400">One line per investment, plus the portfolio total.</p>
          </div>
          {currencies.length > 1 && (
            <div className="flex gap-2">
              {currencies.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`chip-toggle ${activeCurrency === c ? "chip-on" : "chip-off"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        <MultiLineChart series={filteredSeries} currency={activeCurrency} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-lg font-semibold mb-3">Allocation</h3>
          {data.by_type.length === 0 ? <p className="text-ink-400">No data</p> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.by_type} dataKey="current" nameKey="type" outerRadius={100} label={(e) => e.type}>
                    {data.by_type.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-0">
          <div className="px-4 pt-5"><h3 className="text-lg font-semibold">By type</h3></div>
          <table className="w-full table-fixed text-sm mt-3">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-900/60">
              <tr>
                <th className="px-3 py-3 w-[40%]">Type</th>
                <th className="px-3 py-3 text-right">Gain / Loss</th>
                <th className="px-3 py-3 text-right w-[22%]">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {data.by_type.map((b) => {
                const g = b.current - b.invested;
                const pct = b.invested > 0 ? (g / b.invested) * 100 : 0;
                const tone = g >= 0 ? "text-accent-emerald" : "text-red-400";
                return (
                  <tr key={b.type}>
                    <td className="px-3 py-3 truncate">{b.type}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${tone}`}>{fmt(g)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${tone}`}>{pct.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card">
      <div className="field-label">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tone || "text-white"}`}>{value}</div>
    </div>
  );
}

// Turn per-investment point lists into a wide-format array for recharts, carrying
// each investment's last known value forward on days it didn't move.
function buildChartData(series: InvestmentSeries[]) {
  const keys = series.map((s) => s.id);
  const dateSet = new Set<string>();
  series.forEach((s) => s.points.forEach((p) => dateSet.add(p.date)));
  const dates = [...dateSet].sort();

  const byIdDate: Record<string, Record<string, number>> = {};
  series.forEach((s) => {
    const m: Record<string, number> = {};
    s.points.forEach((p) => { m[p.date] = p.value; });
    byIdDate[s.id] = m;
  });

  const last: Record<string, number | null> = Object.fromEntries(keys.map((k) => [k, null]));
  return dates.map((d) => {
    const row: Record<string, string | number> = { date: d };
    let total = 0;
    let any = false;
    keys.forEach((k) => {
      if (byIdDate[k][d] != null) last[k] = byIdDate[k][d];
      if (last[k] != null) {
        row[k] = last[k] as number;
        total += last[k] as number;
        any = true;
      }
    });
    row.total = any ? total : 0;
    return row;
  });
}

function MultiLineChart({ series, currency }: { series: InvestmentSeries[]; currency: string }) {
  const data = useMemo(() => buildChartData(series), [series]);
  if (data.length === 0) return <p className="text-ink-400">No history yet.</p>;
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="date" stroke="#9ca3af" minTickGap={40} />
          <YAxis stroke="#9ca3af" tickFormatter={(v) => compactNumber(v)} />
          <Tooltip
            formatter={(v: number, name: any) => [fmt(v, currency), String(name)]}
            contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8 }}
            labelStyle={{ color: "#cbd5e1" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="total"
            name="Portfolio total"
            stroke="#ffffff"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          {series.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function compactNumber(v: number) {
  if (Math.abs(v) >= 1e7) return (v / 1e7).toFixed(1) + "Cr";
  if (Math.abs(v) >= 1e5) return (v / 1e5).toFixed(1) + "L";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "k";
  return String(Math.round(v));
}
