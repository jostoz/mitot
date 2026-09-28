import { mediaUrl, hueFor, type LinkPreview, type MediaInfo } from "@/lib/api";

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const hue = hueFor(name);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white/90 select-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(145deg, hsl(${hue} 52% 42%), hsl(${(hue + 48) % 360} 48% 26%))`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function MediaPreview({ media }: { media: MediaInfo }) {
  const src = mediaUrl(media.fileName);

  if (media.kind === "IMAGE" || media.kind === "STICKER") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="Adjunto" className="mt-2 max-h-64 w-full rounded-[12px] border border-line-soft object-contain" />;
  }
  if (media.kind === "VIDEO") {
    return <video src={src} controls className="mt-2 max-h-64 w-full rounded-[12px] border border-line-soft" />;
  }
  if (media.kind === "AUDIO") {
    return <audio src={src} controls className="mt-2 w-full" />;
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex w-fit items-center gap-2 rounded-[12px] border border-line bg-panel-2 px-3 py-2 text-[13px] text-accent hover:bg-white/8"
    >
      {media.fileName}
    </a>
  );
}

export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-2.5 block overflow-hidden rounded-[14px] border border-line transition-colors hover:border-fg-3"
    >
      {preview.imageFileName ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(preview.imageFileName)} alt="" className="max-h-44 w-full object-cover" />
      ) : null}
      <div className="bg-panel-2 px-3 py-2.5">
        <p className="text-[12px] uppercase tracking-wide text-fg-3">{preview.siteName}</p>
        {preview.title ? <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold text-fg">{preview.title}</p> : null}
        {preview.description ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-fg-2">{preview.description}</p>
        ) : null}
      </div>
    </a>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<>"')]+)/gi;
const IS_URL = /^https?:\/\//i;

export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <p className={className}>
      {parts.map((part, index) =>
        IS_URL.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
            className="break-all text-accent hover:underline"
          >
            {part.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}
