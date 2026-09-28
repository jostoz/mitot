import type { Metadata } from "next";
import { fetchPublicCommunity } from "@/lib/public-community";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ groupId: string }> };

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { groupId } = await params;
  const payload = await fetchPublicCommunity(groupId);
  const groupName = payload?.group.name ?? "Comunidad";
  const count = payload?.discussions.length ?? 0;
  const description = count
    ? `${count} ${count === 1 ? "discusión ordenada" : "discusiones ordenadas"} automáticamente desde WhatsApp: ${payload!.discussions
        .slice(0, 3)
        .map((d) => d.title)
        .join(" · ")}`
    : "Discusiones de WhatsApp ordenadas automáticamente por Mitot.";
  const ogImage = `/community/${groupId}/opengraph-image`;

  return {
    title: `${groupName} · Mitot`,
    description,
    openGraph: { title: groupName, description, images: [ogImage], type: "website" },
    twitter: { card: "summary_large_image", title: groupName, description, images: [ogImage] },
  };
}

export default async function Community({ params }: RouteParams) {
  const { groupId } = await params;
  const payload = await fetchPublicCommunity(groupId);
  const discussions = payload?.discussions ?? [];

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="border-b border-line-soft pb-7">
          <p className="text-[12px] uppercase tracking-wide text-accent">Mitot · Comunidad</p>
          <h1 className="mt-2 text-[30px] font-bold leading-tight">{payload?.group.name ?? "Comunidad"}</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-fg-2">
            Lo que se decidió y se aprendió en este grupo de WhatsApp, ordenado automáticamente en hilos.
          </p>
        </header>

        <section className="py-8">
          {discussions.length ? (
            <ul className="space-y-4">
              {discussions.map((discussion) => (
                <li key={discussion.id} className="rounded-[18px] border border-line bg-panel p-5">
                  <h2 className="text-[17px] font-semibold leading-snug">{discussion.title}</h2>
                  {discussion.summary ? (
                    <p className="mt-2 text-[14px] leading-[21px] text-fg-2">{discussion.summary}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-fg-3">
                    <span>{discussion.messages.length} mensajes</span>
                    <span aria-hidden>·</span>
                    <span>
                      Actualizada el{" "}
                      {new Date(discussion.lastActivityAt).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "long",
                      })}
                    </span>
                  </div>

                  {discussion.messages.some((message) => message.metadata?.preview) ? (
                    <ul className="mt-3 space-y-1.5 border-t border-line-soft pt-3">
                      {discussion.messages
                        .filter((message) => message.metadata?.preview)
                        .slice(0, 3)
                        .map((message) => (
                          <li key={message.id}>
                            <a
                              href={message.metadata!.preview!.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[13px] text-accent hover:underline"
                            >
                              {message.metadata!.preview!.title ?? message.metadata!.preview!.siteName}
                            </a>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-[14px] text-fg-3">
              Esta comunidad aún no ha publicado hilos.
            </p>
          )}
        </section>

        <footer className="rounded-[18px] border border-line bg-panel-2 p-6">
          <h2 className="text-[17px] font-semibold">¿Tu empresa opera por WhatsApp?</h2>
          <p className="mt-2 text-[14px] leading-[21px] text-fg-2">
            Mitot agrupa los mensajes en discusiones, detecta lo que quedó sin responder y avisa de los pendientes.
            Esta página se generó sola a partir de un grupo real.
          </p>
          <a
            href="mailto:hola@mitot.app?subject=Mitot%20para%20empresas"
            className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-black transition-opacity hover:opacity-90"
          >
            Solicitar acceso para empresas
          </a>
        </footer>
      </div>
    </main>
  );
}
