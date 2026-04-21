import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { blogsApi, usersApi, User } from "../api/client";
import { useAuth } from "../AuthContext";

export default function Users() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const users = useQuery({ queryKey: ["users"], queryFn: usersApi.list });
  const tags = useQuery({ queryKey: ["tags"], queryFn: blogsApi.tags });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => usersApi.create({ email, password, role, display_name: displayName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEmail(""); setPassword(""); setDisplayName(""); setRole("member");
      setErr(null);
    },
    onError: (e: any) => setErr(e?.message || "failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    create.mutate();
  };

  const knownTags = useMemo(() => (tags.data || []).map((t) => t.name), [tags.data]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-ink-400 text-sm mt-1">
          Beyond roles, each member has an allowed-tag list. A user sees a post only if
          <em> every </em> tag on that post is in their allowed list — one untrusted tag hides the post.
        </p>
      </div>

      <div className="card space-y-5">
        <h2 className="text-lg font-semibold">Add user</h2>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <div className="field-label">Email</div>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="space-y-1">
              <div className="field-label">Display name</div>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <div className="field-label">Password</div>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <label className="space-y-1">
              <div className="field-label">Role</div>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as any)}>
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>
          </div>
          {err && <div className="text-sm text-red-400">{err}</div>}
          <div className="flex justify-end">
            <button type="submit" className="btn" disabled={create.isPending}>Create user</button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">All users</h2>
        {users.isLoading ? <p className="text-ink-400">Loading…</p> : (
          <div className="grid gap-4">
            {(users.data || []).map((u) => (
              <UserRow
                key={u.id}
                u={u}
                knownTags={knownTags}
                isSelf={u.id === me?.id}
                onDelete={() => { if (confirm(`Delete ${u.email}?`)) del.mutate(u.id); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserRow({
  u, knownTags, isSelf, onDelete,
}: { u: User; knownTags: string[]; isSelf: boolean; onDelete: () => void }) {
  const qc = useQueryClient();
  const userTags = useQuery({
    queryKey: ["user-tags", u.id],
    queryFn: () => usersApi.getTags(u.id),
    enabled: u.role !== "admin",
  });

  const [pending, setPending] = useState<string[] | null>(null);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    if (userTags.data) setPending(null);
  }, [userTags.data]);

  const current = pending ?? userTags.data ?? [];

  const save = useMutation({
    mutationFn: (tags: string[]) => usersApi.setTags(u.id, tags),
    onSuccess: (saved) => {
      qc.setQueryData(["user-tags", u.id], saved);
      qc.invalidateQueries({ queryKey: ["tags"] });
      setPending(null);
    },
  });

  const toggle = (name: string) => {
    const next = current.includes(name) ? current.filter((t) => t !== name) : [...current, name];
    setPending(next);
  };

  const addCustom = () => {
    const n = newTag.trim().toLowerCase();
    if (!n) return;
    if (!current.includes(n)) setPending([...current, n]);
    setNewTag("");
  };

  const dirty = pending !== null;
  const combined = Array.from(new Set([...knownTags, ...current])).sort();

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-white">{u.display_name || u.email}</div>
          <div className="text-sm text-ink-400 flex items-center gap-2">
            <span>{u.email}</span>
            <span className={`role role-${u.role}`}>{u.role}</span>
          </div>
        </div>
        {!isSelf && <button className="btn-danger" onClick={onDelete}>Delete</button>}
      </div>

      {u.role === "admin" ? (
        <p className="text-sm text-ink-400">Admins see every post regardless of tags.</p>
      ) : (
        <div className="space-y-3">
          <div className="field-label">Allowed tags</div>
          <div className="flex flex-wrap gap-2">
            {combined.length === 0 && (
              <span className="text-sm text-ink-500">No tags yet — create a post with tags, or add one below.</span>
            )}
            {combined.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={`chip-toggle ${current.includes(t) ? "chip-on" : "chip-off"}`}
              >
                #{t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              placeholder="add new tag…"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            />
            <button type="button" className="btn-secondary" onClick={addCustom}>Add</button>
            <button
              type="button"
              className="btn"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate(current)}
            >
              {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
