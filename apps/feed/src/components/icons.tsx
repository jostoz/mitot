type IconProps = {
  className?: string;
  filled?: boolean;
  strokeWidth?: number;
};

const base = (className?: string) => className ?? "h-6 w-6";

export function LogoMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={base(className)} aria-hidden>
      <rect x="3" y="5" width="20" height="15" rx="6" stroke="currentColor" strokeWidth="2.2" />
      <rect x="9" y="12" width="20" height="15" rx="6" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

export function HomeIcon({ className, filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <path
        d="M3.6 10.4 12 3.8l8.4 6.6V20a1 1 0 0 1-1 1h-5v-6h-4.8v6h-5a1 1 0 0 1-1-1v-9.6Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MessageIcon({ className, filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <path
        d="M3.5 5.6 12 11.4l8.5-5.8M3.5 5.5h17v13h-17z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeartIcon({ className, filled, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <path
        d="M12 20.3 4.9 13.6a4.4 4.4 0 0 1 .3-6.6 4.6 4.6 0 0 1 6.2.6l.6.7.6-.7a4.6 4.6 0 0 1 6.2-.6 4.4 4.4 0 0 1 .3 6.6L12 20.3Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UserIcon({ className, filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <circle cx="12" cy="8.4" r="3.8" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.8 20.2c.6-3.8 3.6-5.8 7.2-5.8s6.6 2 7.2 5.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path d="M5 19V10m7 9V5m7 14v-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function BookmarkIcon({ className, filled }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden>
      <path
        d="M6.5 4h11v16l-5.5-4.2L6.5 20V4Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArchiveIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path d="M3.8 7.6h16.4V20H3.8zM3 4.2h18v3.4H3zM9.6 11.6h4.8" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path d="M9 3h6l-1 6 4 3.4V15H6v-2.6L10 9 9 3ZM12 15v6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function RepostIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path
        d="M6.2 9.4V8a2.6 2.6 0 0 1 2.6-2.6h8.4M17.8 14.6V16a2.6 2.6 0 0 1-2.6 2.6H6.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="m3.6 12 2.6 2.8L8.8 12M20.4 12l-2.6-2.8L15.2 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReplyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path d="M4 8.6h11.4a4.6 4.6 0 0 1 0 9.2H9.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m7.6 4.8-3.8 3.8 3.8 3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShareIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path d="M21 3 10.6 13.6M21 3l-6.8 18.2-3.6-7.6L3 10l18-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="currentColor" aria-hidden>
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function BackIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path d="M14.5 5 7.5 12l7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path
        d="M6.4 10.2a5.6 5.6 0 0 1 11.2 0c0 4 1.4 5.4 1.4 5.4H5s1.4-1.4 1.4-5.4ZM10.2 19a2 2 0 0 0 3.6 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path d="m4.5 19.5 4-.9L19.2 7.9a2 2 0 0 0 0-2.8l-.9-.9a2 2 0 0 0-2.8 0L5.4 14.9l-.9 4.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <path d="m5 12.6 4.6 4.4L19 6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VerifiedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-3.5 w-3.5"} aria-hidden>
      <path
        d="m12 2 2.4 2.1 3.1-.4 1 3 2.8 1.4-1 3 1 3-2.8 1.4-1 3-3.1-.4L12 22l-2.4-2.1-3.1.4-1-3L2.7 16l1-3-1-3 2.8-1.4 1-3 3.1.4L12 2Z"
        fill="#3a7bfd"
      />
      <path d="m8 12.2 2.6 2.6L16 9.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PanelIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} fill="none" aria-hidden>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 4.5v15" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
