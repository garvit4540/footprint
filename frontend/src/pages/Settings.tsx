import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { siteApi } from "../api/client";

export default function Settings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["site"], queryFn: siteApi.get });

  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setTitle(data.title);
      setTagline(data.tagline);
      setAbout(data.about);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => siteApi.update({ title, tagline, about }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  if (isLoading) return <p className="text-ink-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Site settings</h1>
        <p className="text-ink-400 text-sm mt-1">Displayed at the top of the home page. Visible to everyone.</p>
      </div>
      <form onSubmit={submit} className="card space-y-5">
        <label className="block space-y-1">
          <div className="field-label">Site title</div>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="block space-y-1">
          <div className="field-label">Tagline</div>
          <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <div className="field-label">About</div>
          <textarea className="input" value={about} onChange={(e) => setAbout(e.target.value)} rows={4} />
        </label>
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-accent-emerald">Saved.</span>}
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
