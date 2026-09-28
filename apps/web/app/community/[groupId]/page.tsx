export const dynamic = "force-dynamic";
type Discussion = { id: string; title: string; summary: string | null; lastActivityAt: string };
export default async function Community({ params }: { params: { groupId: string } }) {
  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:3001";
  const discussions: Discussion[] = await fetch(`${base}/public/groups/${encodeURIComponent(params.groupId)}/discussions`, { cache: "no-store" }).then((r) => r.ok ? r.json() : []);
  return <main className="min-h-screen bg-[#1d1e22] p-8 text-[#e9e9ec]"><header className="mx-auto max-w-3xl border-b border-[#33343a] pb-6"><p className="text-xs text-[#aeadff]">MITOT COMMUNITY</p><h1 className="mt-2 text-3xl font-semibold">Public discussions</h1><p className="mt-2 text-sm text-[#aaaab1]">Curated knowledge from this WhatsApp community.</p></header><section className="mx-auto max-w-3xl py-6">{discussions.length ? discussions.map((d) => <article key={d.id} className="mb-3 rounded border border-[#33343a] bg-[#28292e] p-5"><h2 className="font-medium">{d.title}</h2>{d.summary && <p className="mt-2 text-sm leading-6 text-[#bbb]">{d.summary}</p>}<p className="mt-3 text-xs text-[#888]">Updated {new Date(d.lastActivityAt).toLocaleDateString()}</p></article>) : <p className="text-sm text-[#999]">No public discussions yet.</p>}</section></main>;
}
