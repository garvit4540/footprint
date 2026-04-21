import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { blogsApi, ROLES, uploadImage } from "../api/client";

export default function BlogEditor() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const qc = useQueryClient();

  const existing = useQuery({
    queryKey: ["blog", id],
    queryFn: () => blogsApi.get(id!),
    enabled: editing,
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [roles, setRoles] = useState<string[]>(["member"]);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && existing.data) {
      setTitle(existing.data.title);
      setBody(existing.data.body);
      setTagsText(existing.data.tags.join(", "));
      setRoles(existing.data.roles.length ? existing.data.roles : ["member"]);
    }
  }, [editing, existing.data]);

  const tags = useMemo(
    () => tagsText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    [tagsText]
  );

  const save = useMutation({
    mutationFn: () => {
      const payload = { title, body, tags, roles };
      return editing ? blogsApi.update(id!, payload) : blogsApi.create(payload);
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["blogs"] });
      qc.invalidateQueries({ queryKey: ["blog", b.id] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      nav(`/blogs/${b.id}`);
    },
    onError: (e: any) => setErr(e?.message || "save failed"),
  });

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) { setBody((b) => b + text); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const f of list) {
        const { url } = await uploadImage(f);
        const alt = f.name.replace(/\.[^.]+$/, "");
        insertAtCursor(`\n\n![${alt}](${url})\n\n`);
      }
    } catch (e: any) {
      setErr(e?.message || "upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      upload(files);
    }
  };

  const toggleRole = (r: string) => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    save.mutate();
  };

  if (editing && existing.isLoading) return <p className="text-ink-400">Loading…</p>;

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to={editing ? `/blogs/${id}` : "/"} className="text-sm text-ink-400 hover:text-white">
          ← Cancel
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? "Edit" : "Preview"}
          </button>
          <button type="submit" className="btn" disabled={save.isPending || !title}>
            {save.isPending ? "Saving…" : editing ? "Save" : "Publish"}
          </button>
        </div>
      </div>

      <input
        className="w-full bg-transparent border-none text-4xl sm:text-5xl font-bold tracking-tight
                   text-white placeholder-ink-600 focus:outline-none"
        placeholder="Post title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />

      {preview ? (
        <div className="prose-blog">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {body || "*(nothing to preview)*"}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Insert image"}
            </button>
            <span className="text-xs text-ink-500">drop, paste, or click — supports PNG, JPG, GIF, WebP, SVG</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && upload(e.target.files)}
            />
          </div>
          <textarea
            ref={textareaRef}
            className={`input min-h-[380px] font-mono text-sm leading-relaxed ${dragOver ? "dropzone-active" : ""}`}
            placeholder="Write in markdown… # headings, **bold**, lists, `code`, [links](), images"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onPaste={onPaste}
            rows={18}
          />
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-1">
          <div className="field-label">Tags</div>
          <input
            className="input"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="finance, crypto, notes"
          />
          <p className="text-xs text-ink-500">Comma separated. Auto-lowercased.</p>
        </label>
        <div className="space-y-1">
          <div className="field-label">Visible to</div>
          <div className="flex flex-wrap gap-2 pt-1">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRole(r)}
                className={`chip-toggle ${roles.includes(r) ? "chip-on" : "chip-off"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-500">
            <code>public</code>: anyone, no login. <code>member</code>: any signed-in user. Beyond roles,
            a user can read this post only if they're allowed <em>every</em> tag below — a
            single untrusted tag on a post hides it from that user.
          </p>
        </div>
      </div>

      {err && <div className="card border-red-500/40 bg-red-500/10 text-red-300 text-sm">{err}</div>}
    </form>
  );
}
