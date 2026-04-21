import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fmt, Loan, loansApi } from "../api/client";

export default function Loans() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState<"borrowed" | "lent" | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["loans"], queryFn: loansApi.list });

  const loans = data || [];
  const borrowed = useMemo(() => loans.filter((l) => l.direction === "borrowed"), [loans]);
  const lent = useMemo(() => loans.filter((l) => l.direction === "lent"), [loans]);

  const sumOutstanding = (arr: Loan[]) =>
    arr.reduce<Record<string, number>>((acc, l) => {
      acc[l.currency] = (acc[l.currency] || 0) + l.outstanding;
      return acc;
    }, {});

  const totalOwe = sumOutstanding(borrowed);
  const totalCollect = sumOutstanding(lent);

  const net = new Set([...Object.keys(totalOwe), ...Object.keys(totalCollect)]);
  const netByCurrency: Record<string, number> = {};
  net.forEach((c) => { netByCurrency[c] = (totalCollect[c] || 0) - (totalOwe[c] || 0); });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Loans</h1>
        <p className="text-ink-400 text-sm mt-1">
          Track money you've borrowed and money you've lent. Record partial repayments as they happen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title="You owe"
          tone="debt"
          totals={totalOwe}
          empty="Nothing borrowed."
        />
        <SummaryCard
          title="Owed to you"
          tone="credit"
          totals={totalCollect}
          empty="Nothing lent."
        />
        <SummaryCard
          title="Net position"
          tone="neutral"
          totals={netByCurrency}
          empty="All clear."
          signed
        />
      </div>

      {isLoading && <p className="text-ink-400">Loading…</p>}

      <Section
        title="Money you borrowed"
        subtitle="People you owe."
        tone="debt"
        loans={borrowed}
        onAdd={() => setAdding("borrowed")}
      />

      <Section
        title="Money you lent"
        subtitle="People who owe you."
        tone="credit"
        loans={lent}
        onAdd={() => setAdding("lent")}
      />

      {adding && <LoanModal direction={adding} onClose={() => setAdding(null)} onCreated={() => {
        qc.invalidateQueries({ queryKey: ["loans"] });
      }} />}
    </div>
  );
}

type Tone = "debt" | "credit" | "neutral";

function toneBg(t: Tone) {
  if (t === "debt") return "from-rose-500/10 to-rose-500/0 border-rose-500/30";
  if (t === "credit") return "from-emerald-500/10 to-emerald-500/0 border-emerald-500/30";
  return "from-brand-500/10 to-brand-500/0 border-brand-500/30";
}
function toneText(t: Tone) {
  if (t === "debt") return "text-rose-300";
  if (t === "credit") return "text-emerald-300";
  return "text-brand-300";
}
function toneBar(t: Tone) {
  if (t === "debt") return "bg-rose-400";
  if (t === "credit") return "bg-emerald-400";
  return "bg-brand-400";
}
function toneLabel(t: Tone) {
  if (t === "debt") return "Borrowed";
  if (t === "credit") return "Lent";
  return "Loan";
}

function SummaryCard({
  title, tone, totals, empty, signed,
}: { title: string; tone: Tone; totals: Record<string, number>; empty: string; signed?: boolean }) {
  const currencies = Object.keys(totals).filter((c) => totals[c] !== 0);
  return (
    <div className={`relative rounded-xl border p-5 bg-gradient-to-br ${toneBg(tone)}`}>
      <div className="field-label">{title}</div>
      {currencies.length === 0 ? (
        <div className="mt-2 text-ink-400 text-sm">{empty}</div>
      ) : (
        <div className="mt-2 space-y-1">
          {currencies.map((c) => {
            const v = totals[c];
            const sign = signed && v > 0 ? "+" : signed && v < 0 ? "" : "";
            const colour = signed ? (v >= 0 ? "text-emerald-300" : "text-rose-300") : toneText(tone);
            return (
              <div key={c} className={`text-2xl font-semibold ${colour}`}>
                {sign}{fmt(Math.abs(v), c)}
                {signed && <span className="text-xs text-ink-400 ml-2">{v >= 0 ? "you'll collect" : "you owe"}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({
  title, subtitle, tone, loans, onAdd,
}: { title: string; subtitle: string; tone: Tone; loans: Loan[]; onAdd: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-ink-400 text-sm">{subtitle}</p>
        </div>
        <button className="btn" onClick={onAdd}>+ Add {toneLabel(tone).toLowerCase()}</button>
      </div>
      {loans.length === 0 ? (
        <div className="card text-center py-8 text-ink-400 text-sm">Nothing here yet.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {loans.map((l) => <LoanCard key={l.id} loan={l} tone={tone} />)}
        </div>
      )}
    </div>
  );
}

function LoanCard({ loan, tone }: { loan: Loan; tone: Tone }) {
  const qc = useQueryClient();
  const [recording, setRecording] = useState(false);
  const settled = loan.outstanding <= 0.005;
  const progress = loan.principal > 0
    ? Math.min(100, Math.max(0, (loan.paid / loan.principal) * 100))
    : 0;

  const removeLoan = useMutation({
    mutationFn: () => loansApi.remove(loan.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loans"] }),
  });
  const removePayment = useMutation({
    mutationFn: (pid: number) => loansApi.removePayment(loan.id, pid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loans"] }),
  });

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${toneBg(tone)} p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-ink-400">
            {tone === "debt" ? "You borrowed from" : "You lent to"}
          </div>
          <div className="text-lg font-semibold">{loan.counterparty}</div>
          {loan.opened_on && (
            <div className="text-xs text-ink-500 mt-0.5">
              Opened {new Date(loan.opened_on).toLocaleDateString()}
            </div>
          )}
        </div>
        {settled ? (
          <span className="role role-public">settled</span>
        ) : (
          <span className={`role ${tone === "debt" ? "bg-rose-500/10 text-rose-300 border-rose-500/30" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"}`}>
            open
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Mini label={tone === "debt" ? "Borrowed" : "Lent"} value={fmt(loan.principal, loan.currency)} />
        <Mini label="Paid back" value={fmt(loan.paid, loan.currency)} tone="text-ink-300" />
        <Mini
          label="Outstanding"
          value={fmt(loan.outstanding, loan.currency)}
          tone={settled ? "text-ink-400" : toneText(tone)}
        />
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-ink-400 mb-1">
          <span>{progress.toFixed(0)}% repaid</span>
          <span>{loan.payments.length} payment{loan.payments.length === 1 ? "" : "s"}</span>
        </div>
        <div className="h-2 rounded-full bg-ink-800 overflow-hidden">
          <div className={`h-full ${toneBar(tone)} transition-all`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {loan.notes && <p className="text-sm text-ink-300 whitespace-pre-wrap">{loan.notes}</p>}

      {loan.payments.length > 0 && (
        <details className="group">
          <summary className="text-xs text-ink-400 cursor-pointer hover:text-ink-200">
            Payment history
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {loan.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{fmt(p.amount, loan.currency)}</span>
                  <span className="text-xs text-ink-500">
                    {new Date(p.paid_on).toLocaleDateString()}
                  </span>
                  {p.notes && <span className="text-xs text-ink-400">· {p.notes}</span>}
                </div>
                <button
                  className="text-xs text-ink-500 hover:text-rose-300"
                  onClick={() => { if (confirm("Remove this payment?")) removePayment.mutate(p.id); }}
                  title="Remove payment"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button className="btn" onClick={() => setRecording(true)} disabled={settled}>
          {tone === "debt" ? "I paid back" : "Payment received"}
        </button>
        <button
          className="btn-ghost text-xs"
          onClick={() => { if (confirm(`Delete this ${toneLabel(tone).toLowerCase()} loan with ${loan.counterparty}?`)) removeLoan.mutate(); }}
        >
          Delete loan
        </button>
      </div>

      {recording && (
        <PaymentModal
          loan={loan}
          tone={tone}
          onClose={() => setRecording(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["loans"] });
            setRecording(false);
          }}
        />
      )}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`font-semibold mt-0.5 ${tone || "text-white"}`}>{value}</div>
    </div>
  );
}

function PaymentModal({
  loan, tone, onClose, onSaved,
}: { loan: Loan; tone: Tone; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState<string>(String(Math.max(0, loan.outstanding).toFixed(2)));
  const [paidOn, setPaidOn] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => loansApi.addPayment(loan.id, {
      amount: parseFloat(amount),
      paid_on: paidOn || null,
      notes: notes || null,
    }),
    onSuccess: onSaved,
    onError: (e: any) => setErr(e?.message || "failed"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!(parseFloat(amount) > 0)) { setErr("amount must be > 0"); return; }
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div>
          <h3 className="text-lg font-semibold">
            {tone === "debt" ? "Record repayment" : "Record received payment"}
          </h3>
          <p className="text-ink-400 text-sm">
            {loan.counterparty} · Outstanding {fmt(loan.outstanding, loan.currency)}
          </p>
        </div>
        <label className="space-y-1 block">
          <div className="field-label">Amount ({loan.currency})</div>
          <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <label className="space-y-1 block">
          <div className="field-label">Date</div>
          <input className="input" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
        <label className="space-y-1 block">
          <div className="field-label">Notes (optional)</div>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Record payment"}
          </button>
        </div>
      </form>
    </div>
  );
}

function LoanModal({
  direction, onClose, onCreated,
}: { direction: "borrowed" | "lent"; onClose: () => void; onCreated: () => void }) {
  const [counterparty, setCounterparty] = useState("");
  const [principal, setPrincipal] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [openedOn, setOpenedOn] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => loansApi.create({
      counterparty, direction,
      principal: parseFloat(principal),
      currency,
      opened_on: openedOn || null,
      notes: notes || null,
    } as any),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setErr(e?.message || "failed"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!counterparty.trim()) { setErr("counterparty required"); return; }
    if (!(parseFloat(principal) > 0)) { setErr("principal must be > 0"); return; }
    save.mutate();
  };

  const title = direction === "borrowed" ? "New money borrowed" : "New money lent";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <label className="space-y-1 block">
          <div className="field-label">{direction === "borrowed" ? "Borrowed from" : "Lent to"}</div>
          <input className="input" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} autoFocus />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 block">
            <div className="field-label">Amount</div>
            <input className="input" type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </label>
          <label className="space-y-1 block">
            <div className="field-label">Currency</div>
            <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </label>
        </div>
        <label className="space-y-1 block">
          <div className="field-label">Opened on</div>
          <input className="input" type="date" value={openedOn} onChange={(e) => setOpenedOn(e.target.value)} />
        </label>
        <label className="space-y-1 block">
          <div className="field-label">Notes</div>
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
