import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { blogsApi } from "../api/client";
import { useAuth } from "../AuthContext";
import { readingTime } from "../lib/blog";

export default function BlogDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["blog", id],
    queryFn: () => blogsApi.get(id),
  });

  if (isLoading) return <p className="text-ink-400">Loading…</p>;
  if (error || !data) {
    return (
      <div className="card text-center py-14">
        <p className="text-ink-300">Not found, or you don't have access.</p>
        <Link to="/" className="btn-secondary mt-5 inline-flex">← Back home</Link>
      </div>
    );
  }

  return (
    <article className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-ink-400 hover:text-white">← All posts</Link>
      </div>

      <header className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {data.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
          {user?.role === "admin" && data.roles.map((r) => <span key={r} className={`role role-${r}`}>{r}</span>)}
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{data.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-400">
          {data.author && <span>{data.author}</span>}
          {data.author && <span>·</span>}
          <span>
            {new Date(data.created_at).toLocaleDateString(undefined, {
              year: "numeric", month: "long", day: "numeric",
            })}
          </span>
          <span>·</span>
          <span>{readingTime(data.body)} min read</span>
          {user?.role === "admin" && (
            <div className="ml-auto flex gap-2">
              <Link to={`/blogs/${data.id}/edit`} className="btn-ghost">Edit</Link>
            </div>
          )}
        </div>
      </header>

      <hr />

      <div className="prose-blog">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {data.body || "*(no content yet)*"}
        </ReactMarkdown>
      </div>
    </article>
  );
}
