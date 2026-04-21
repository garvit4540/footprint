import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tagsApi } from "../api/client";

export default function Tags() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["tags-usage"], queryFn: tagsApi.usage });

  const del = useMutation({
    mutationFn: (id: string) => tagsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags-usage"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["blogs"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const tags = data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tags</h1>
        <p className="text-ink-400 text-sm mt-1">
          Deleting a tag removes it from every post that used it and from every user that had it allowed.
          Posts and users stay; only the tag link disappears.
        </p>
      </div>

      {isLoading ? (
        <p className="text-ink-400">Loading…</p>
      ) : tags.length === 0 ? (
        <div className="card text-center py-10 text-ink-400">No tags yet.</div>
      ) : (
        <div className="card p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-900/60">
              <tr>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3">Posts</th>
                <th className="px-4 py-3">Users with access</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {tags.map((t) => (
                <tr key={t.id} className="hover:bg-ink-900/60">
                  <td className="px-4 py-3"><span className="tag">#{t.name}</span></td>
                  <td className="px-4 py-3 text-ink-300">{t.blogs}</td>
                  <td className="px-4 py-3 text-ink-300">{t.users}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="btn-danger"
                      disabled={del.isPending}
                      onClick={() => {
                        const msg = t.blogs + t.users > 0
                          ? `Delete #${t.name}?\n\nIt's on ${t.blogs} post(s) and ${t.users} user allowlist(s). The tag will be removed from all of them.`
                          : `Delete #${t.name}?`;
                        if (confirm(msg)) del.mutate(t.id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
