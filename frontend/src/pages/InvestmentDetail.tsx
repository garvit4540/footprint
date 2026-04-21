import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, fmt } from "../api/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function InvestmentDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const inv = useQuery({ queryKey: ["investment", id], queryFn: () => api.get(id) });
  const hist = useQuery({ queryKey: ["history", id], queryFn: () => api.history(id) });
  const flows = useQuery({ queryKey: ["flows", id], queryFn: () => api.flows(id) });
  const [adding, setAdding] = useState<null | "contribution" | "withdrawal">(null);

  const history = useMemo(() => (hist.data || []).slice().sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  ), [hist.data]);

  const addFlow = useMutation({
    mutationFn: (body: { kind: "contribution" | "withdrawal"; amount: number; occurred_on?: string | null; notes?: string | null }) =>
      api.addFlow(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flows", id] });
      qc.invalidateQueries({ queryKey: ["investment", id] }); // purchase_value changes
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      setAdding(null);
    },
  });

  if (inv.isLoading) return <p className="text-ink-400">Loading…</p>;
  if (!inv.data) return <p>Not found. <Link to="/investments">Back</Link></p>;
  const i = inv.data;
  const gain = i.current_value - i.purchase_value;
  const gainPct = i.purchase_value > 0 ? (gain / i.purchase_value) * 100 : 0;
  const tone = gain >= 0 ? "text-accent-emerald" : "text-red-400";

  const chartData = history.map((p) => ({
    date: new Date(p.recorded_at).toISOString().slice(0, 10),
    value: p.value,
  }));

  const first = history[0]?.value ?? i.current_value;
  const maxValue = history.length ? Math.max(...history.map((p) => p.value)) : i.current_value;
  const minValue = history.length ? Math.min(...history.map((p) => p.value)) : i.current_value;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/investments" className="text-sm text-ink-400 hover:text-white">← Investments</Link>
      </div>

      <div className="card space-y-4">
        <div>
          <h1 className="text-3xl font-semibold">{i.name}</h1>
          <p className="text-sm text-ink-400">
            {i.type}{i.purchase_date ? ` · Purchased ${i.purchase_date.slice(0, 10)}` : ""}
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Stat label="Invested" value={fmt(i.purchase_value, i.currency)} />
          <Stat label="Current" value={fmt(i.current_value, i.currency)} />
          <Stat label="Gain" value={`${fmt(gain, i.currency)} (${gainPct.toFixed(2)}%)`} tone={tone} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn-secondary" onClick={() => setAdding("contribution")}>+ Add money</button>
          <button className="btn-secondary" onClick={() => setAdding("withdrawal")}>− Withdraw</button>
        </div>
        {i.notes && <p className="text-ink-300 mt-2">{i.notes}</p>}
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Cashflows</h3>
          <p className="text-sm text-ink-500">Contributions/withdrawals update “Invested”.</p>
        </div>
        {flows.isLoading ? (
          <p className="text-ink-400">Loading…</p>
        ) : (flows.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-900/60">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {flows.data!.map((f) => {
                  const sign = f.kind === "withdrawal" ? "-" : "+";
                  const tone2 = f.kind === "withdrawal" ? "text-red-400" : "text-accent-emerald";
                  const d = f.occurred_on ? f.occurred_on.slice(0, 10) : new Date(f.created_at).toISOString().slice(0, 10);
                  return (
                    <tr key={f.id}>
                      <td className="px-4 py-3 text-ink-400">{d}</td>
                      <td className="px-4 py-3">{f.kind}</td>
                      <td className={`px-4 py-3 ${tone2}`}>{sign}{fmt(f.amount, i.currency)}</td>
                      <td className="px-4 py-3 text-ink-300">{f.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ink-400">No cashflows recorded yet.</p>
        ))}
      </div>

      <div className="card space-y-5">
        <h3 className="text-lg font-semibold">Valuation over time</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <Stat label="First tracked" value={fmt(first, i.currency)} />
          <Stat label="High" value={fmt(maxValue, i.currency)} tone="text-accent-emerald" />
          <Stat label="Low" value={fmt(minValue, i.currency)} tone="text-red-400" />
        </div>
        {chartData.length === 0 ? <p className="text-ink-400">No data</p> : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  formatter={(v: number) => fmt(v, i.currency)}
                  contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="value" stroke="#60a5fa" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="card p-0">
          <div className="px-5 pt-5"><h3 className="text-lg font-semibold">Value updates</h3></div>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-900/60">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Since invested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {history.slice().reverse().map((p, idx, arr) => {
                  const prev = arr[idx + 1]?.value;
                  const diff = prev != null ? p.value - prev : null;
                  const diffPct = prev && prev !== 0 ? (diff! / prev) * 100 : null;
                  const sincePurchase = p.value - i.purchase_value;
                  const sincePct = i.purchase_value > 0 ? (sincePurchase / i.purchase_value) * 100 : 0;
                  const diffTone = diff == null ? "text-ink-500" : diff >= 0 ? "text-accent-emerald" : "text-red-400";
                  const sinceTone = sincePurchase >= 0 ? "text-accent-emerald" : "text-red-400";
                  return (
                    <tr key={p.recorded_at}>
                      <td className="px-4 py-3 text-ink-400">{new Date(p.recorded_at).toLocaleString()}</td>
                      <td className="px-4 py-3">{fmt(p.value, i.currency)}</td>
                      <td className={`px-4 py-3 ${diffTone}`}>
                        {diff == null ? "—" : `${diff >= 0 ? "+" : ""}${fmt(diff, i.currency)} (${diffPct!.toFixed(2)}%)`}
                      </td>
                      <td className={`px-4 py-3 ${sinceTone}`}>
                        {sincePurchase >= 0 ? "+" : ""}{fmt(sincePurchase, i.currency)} ({sincePct.toFixed(2)}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adding && (
        <AddFlowModal
          kind={adding}
          currency={i.currency}
          isPending={addFlow.isPending}
          onClose={() => setAdding(null)}
          onSubmit={(body) => addFlow.mutate(body)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${tone || "text-white"}`}>{value}</div>
    </div>
  );
}

function AddFlowModal({
  kind,
  currency,
  onClose,
  onSubmit,
  isPending,
}: {
  kind: "contribution" | "withdrawal";
  currency: string;
  onClose: () => void;
  onSubmit: (body: { kind: "contribution" | "withdrawal"; amount: number; occurred_on?: string | null; notes?: string | null }) => void;
  isPending: boolean;
}) {
  const [amount, setAmount] = useState<string>("");
  const [occurredOn, setOccurredOn] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>("");
  const title = kind === "contribution" ? "Add money" : "Withdraw money";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <label className="space-y-1 block">
          <div className="field-label">Amount ({currency})</div>
          <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="space-y-1 block">
          <div className="field-label">Date</div>
          <input className="input" type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
        </label>
        <label className="space-y-1 block">
          <div className="field-label">Notes</div>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            onClick={() => onSubmit({ kind, amount: Number(amount), occurred_on: occurredOn || null, notes: notes || null })}
            disabled={isPending || !amount || Number(amount) <= 0}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
