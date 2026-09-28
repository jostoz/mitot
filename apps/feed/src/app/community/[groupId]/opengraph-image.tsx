import { ImageResponse } from "next/og";
import { fetchPublicCommunity } from "@/lib/public-community";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Discusiones de WhatsApp ordenadas por Mitot";

export default async function OpengraphImage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const payload = await fetchPublicCommunity(groupId);
  const groupName = payload?.group.name ?? "Comunidad";
  const discussions = payload?.discussions.slice(0, 3) ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "#0a0a0a",
          color: "#f3f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "linear-gradient(145deg, #3a7bfd, #2456c9)",
              display: "flex",
            }}
          />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>mitot</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 22, color: "#3a7bfd", fontWeight: 600 }}>COMUNIDAD</div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700, lineHeight: 1.15 }}>{groupName}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            {discussions.length ? (
              discussions.map((discussion) => (
                <div
                  key={discussion.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    fontSize: 28,
                    color: "#c6c8cb",
                  }}
                >
                  <div style={{ display: "flex", width: 8, height: 8, borderRadius: 999, background: "#3a7bfd" }} />
                  <div style={{ display: "flex" }}>{discussion.title}</div>
                </div>
              ))
            ) : (
              <div style={{ display: "flex", fontSize: 28, color: "#777777" }}>Discusiones ordenadas automáticamente</div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 22, color: "#777777" }}>
          Mensajes de WhatsApp agrupados en discusiones — automáticamente
        </div>
      </div>
    ),
    { ...size },
  );
}
