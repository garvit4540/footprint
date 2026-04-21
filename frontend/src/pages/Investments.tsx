import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, fmt, Investment, TYPES } from "../api/client";

export default function Investments() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["investments"], queryFn: api.list });

  const del = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const updateValue = useMutation({
    mutationFn: ({ id, v }: { id: string; v: number }) => api.update(id, { current_value: v }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["history", vars.id] });
    },
  });

  if (isLoading) return <p className="text-ink-400">Loading…</p>;
  const items = (data || []).filter((i) => !filter || i.type === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Investments</h1>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn" onClick={() => setAdding(true)}>+ Add</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-900/80">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Invested</th>
              <th className="px-4 py-3">Current</th>
              <th className="px-4 py-3">Gain</th>
              <th className="px-4 py-3">%</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Update value</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {items.map((i) => <Row key={i.id} inv={i}
              onUpdate={(v) => updateValue.mutate({ id: i.id, v })}
              onDelete={() => { if (confirm(`Delete ${i.name}?`)) del.mutate(i.id); }} />)}
            {items.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-ink-500">No investments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && <AddModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function Row({ inv, onUpdate, onDelete }: { inv: Investment; onUpdate: (v: number) => void; onDelete: () => void }) {
  const [v, setV] = useState(String(inv.current_value));
  const gain = inv.current_value - inv.purchase_value;
  const pct = inv.purchase_value > 0 ? (gain / inv.purchase_value) * 100 : 0;
  const toneCls = gain >= 0 ? "text-accent-emerald" : "text-red-400";
  return (
    <tr className="hover:bg-ink-900/60">
      <td className="px-4 py-3"><Link to={`/investments/${inv.id}`} className="text-white hover:text-brand-300">{inv.name}</Link></td>
      <td className="px-4 py-3 text-ink-400">{inv.type}</td>
      <td className="px-4 py-3">{fmt(inv.purchase_value, inv.currency)}</td>
      <td className="px-4 py-3 font-medium">{fmt(inv.current_value, inv.currency)}</td>
      <td className={`px-4 py-3 ${toneCls}`}>{fmt(gain, inv.currency)}</td>
      <td className={`px-4 py-3 ${toneCls}`}>{pct.toFixed(2)}%</td>
      <td className="px-4 py-3 text-ink-400">{new Date(inv.updated_at).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <input className="input w-28" type="number" step="0.01" value={v} onChange={(e) => setV(e.target.value)} />
          <button className="btn-secondary" onClick={() => onUpdate(parseFloat(v))}>Save</button>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <button className="btn-danger" onClick={onDelete}>Delete</button>
      </td>
    </tr>
  );
}

function AddModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", type: "STOCK", purchase_value: 0, current_value: 0,
    purchase_date: "", currency: "INR", notes: "",
  });
  const create = useMutation({
    mutationFn: () => api.create({
      name: form.name,
      type: form.type,
      purchase_value: Number(form.purchase_value),
      current_value: Number(form.current_value),
      purchase_date: form.purchase_date || null,
      currency: form.currency || "INR",
      notes: form.notes || null,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      onClose();
    },
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Add investment</h3>
        <label className="space-y-1 block">
          <div className="field-label">Name</div>
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="space-y-1 block">
          <div className="field-label">Type</div>
          <select className="input" value={form.type} onChange={(e) => set("type", e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 block">
            <div className="field-label">Purchase value</div>
            <input className="input" type="number" step="0.01" value={form.purchase_value} onChange={(e) => set("purchase_value", e.target.value)} />
          </label>
          <label className="space-y-1 block">
            <div className="field-label">Current value</div>
            <input className="input" type="number" step="0.01" value={form.current_value} onChange={(e) => set("current_value", e.target.value)} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 block">
            <div className="field-label">Purchase date</div>
            <input className="input" type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
          </label>
          <label className="space-y-1 block">
            <div className="field-label">Currency</div>
            <input className="input" value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </label>
        </div>
        <label className="space-y-1 block">
          <div className="field-label">Notes</div>
          <textarea className="input" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={() => create.mutate()} disabled={!form.name}>Create</button>
        </div>
      </div>
    </div>
  );
}
