import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { blogsApi, siteApi, Blog } from "../api/client";
import { useAuth } from "../AuthContext";
import { excerpt, firstImage, readingTime } from "../lib/blog";

export default function Blogs() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const site = useQuery({ queryKey: ["site"], queryFn: siteApi.get });
  const blogs = useQuery({ queryKey: ["blogs"], queryFn: blogsApi.list });

  const [tagFilter, setTagFilter] = useState<string>("");

  useEffect(() => {
    if (site.data?.title) document.title = site.data.title;
  }, [site.data?.title]);

  const del = useMutation({
    mutationFn: (id: string) => blogsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blogs"] }),
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    (blogs.data || []).forEach((b) => b.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [blogs.data]);

  const items = (blogs.data || []).filter((b) => !tagFilter || b.tags.includes(tagFilter));
  const featured = items[0];
  const rest = items.slice(1);

  return (
    <div className="space-y-14">
      <header className="relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40 px-6 py-12 sm:px-10 sm:py-16">
        <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
        <div
          className="absolute inset-0 bg-hero-grid pointer-events-none [background-size:22px_22px] opacity-40"
        />
        <div className="relative animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1 text-xs text-ink-400">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse" />
            Personal notebook
          </div>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-white to-brand-300 bg-clip-text text-transparent">
            {site.data?.title || "My Notes"}
          </h1>
          {site.data?.tagline && (
            <p className="mt-3 text-lg text-ink-300 max-w-2xl">{site.data.tagline}</p>
          )}
          {site.data?.about && (
            <p className="mt-4 text-ink-400 max-w-2xl whitespace-pre-wrap">{site.data.about}</p>
          )}
        </div>
      </header>

      <section>
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-semibold">Writing</h2>
            <p className="text-sm text-ink-400">
              {items.length} {items.length === 1 ? "post" : "posts"}
              {tagFilter && <> in <span className="tag">#{tagFilter}</span></>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && <Link to="/blogs/new" className="btn">+ New post</Link>}
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            <button
              onClick={() => setTagFilter("")}
              className={`chip-toggle ${tagFilter === "" ? "chip-on" : "chip-off"}`}
            >
              All
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? "" : t)}
                className={`chip-toggle ${tagFilter === t ? "chip-on" : "chip-off"}`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        {blogs.isLoading && <p className="text-ink-400">Loading…</p>}

        {!blogs.isLoading && items.length === 0 && (
          <div className="card text-center py-14">
            <p className="text-ink-300">
              {isAdmin ? "No posts yet — write your first one." : "Nothing here yet."}
            </p>
            {isAdmin && (
              <Link to="/blogs/new" className="btn mt-5 inline-flex">
                + New post
              </Link>
            )}
          </div>
        )}

        {featured && (
          <FeaturedCard
            blog={featured}
            isAdmin={isAdmin}
            onDelete={() => { if (confirm(`Delete "${featured.title}"?`)) del.mutate(featured.id); }}
          />
        )}

        {rest.length > 0 && (
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {rest.map((b) => (
              <PostCard
                key={b.id}
                blog={b}
                isAdmin={isAdmin}
                onDelete={() => { if (confirm(`Delete "${b.title}"?`)) del.mutate(b.id); }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Meta({ blog }: { blog: Blog }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-400">
      <span>
        {new Date(blog.created_at).toLocaleDateString(undefined, {
          year: "numeric", month: "long", day: "numeric",
        })}
      </span>
      <span>·</span>
      <span>{readingTime(blog.body)} min read</span>
      {blog.author && (
        <>
          <span>·</span>
          <span>{blog.author}</span>
        </>
      )}
    </div>
  );
}

function Chips({ blog, showRoles }: { blog: Blog; showRoles: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {blog.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
      {showRoles && blog.roles.map((r) => <span key={r} className={`role role-${r}`}>{r}</span>)}
    </div>
  );
}

function AdminActions({
  blog, onDelete,
}: { blog: Blog; onDelete: () => void }) {
  return (
    <div className="flex gap-2">
      <Link to={`/blogs/${blog.id}/edit`} className="btn-ghost">Edit</Link>
      <button className="btn-danger" onClick={onDelete}>Delete</button>
    </div>
  );
}

function FeaturedCard({
  blog, isAdmin, onDelete,
}: { blog: Blog; isAdmin: boolean; onDelete: () => void }) {
  const cover = firstImage(blog.body);
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-ink-800 bg-gradient-to-br from-ink-900/90 to-ink-900/40 hover:border-brand-500/40 transition-all animate-rise">
      <div className="grid md:grid-cols-5 gap-0">
        {cover && (
          <Link to={`/blogs/${blog.id}`} className="md:col-span-2 block overflow-hidden bg-ink-800 max-h-80 md:max-h-none">
            <img
              src={cover}
              alt=""
              className="w-full h-full object-cover aspect-video md:aspect-auto transition-transform duration-500 group-hover:scale-105"
            />
          </Link>
        )}
        <div className={`${cover ? "md:col-span-3" : "md:col-span-5"} p-6 sm:p-8 flex flex-col`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-400">
            Latest
          </div>
          <h3 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
            <Link to={`/blogs/${blog.id}`} className="text-white hover:text-brand-300">
              {blog.title}
            </Link>
          </h3>
          <div className="mt-2"><Meta blog={blog} /></div>
          <p className="mt-4 text-ink-300 leading-relaxed">{excerpt(blog.body, 260)}</p>
          <div className="mt-auto pt-4 flex items-center justify-between gap-3">
            <Chips blog={blog} showRoles={isAdmin} />
            {isAdmin && <AdminActions blog={blog} onDelete={onDelete} />}
          </div>
        </div>
      </div>
    </article>
  );
}

function PostCard({
  blog, isAdmin, onDelete,
}: { blog: Blog; isAdmin: boolean; onDelete: () => void }) {
  const cover = firstImage(blog.body);
  return (
    <article className="group rounded-2xl border border-ink-800 bg-ink-900/50 hover:border-brand-500/40 hover:bg-ink-900/80 transition-all overflow-hidden flex flex-col">
      {cover && (
        <Link to={`/blogs/${blog.id}`} className="block overflow-hidden aspect-[16/9] bg-ink-800">
          <img
            src={cover}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
      )}
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-xl font-semibold tracking-tight">
          <Link to={`/blogs/${blog.id}`} className="text-white hover:text-brand-300">
            {blog.title}
          </Link>
        </h3>
        <div className="mt-1"><Meta blog={blog} /></div>
        <p className="mt-3 text-ink-300 text-sm leading-relaxed">{excerpt(blog.body, 160)}</p>
        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
          <Chips blog={blog} showRoles={isAdmin} />
          {isAdmin && <AdminActions blog={blog} onDelete={onDelete} />}
        </div>
      </div>
    </article>
  );
}
