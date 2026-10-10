/** UI icons: 24 px grid, 1.75 px stroke, round caps and joins, drawn as if in thread (brand.md §11). */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 24): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
});

export const IconMenu = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconBack = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const IconChevron = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconCheck = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
/** Your audio, above: two short lines (from the mark). */
export const IconAudioAbove = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 9h14M8 14h8" />
  </svg>
);
export const IconQuiet = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M8 12h8" />
  </svg>
);
export const IconHeadphones = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 15v-3a8 8 0 0116 0v3" />
    <path d="M4 15a2 2 0 012-2h1v6H6a2 2 0 01-2-2v-2zM20 15a2 2 0 00-2-2h-1v6h1a2 2 0 002-2v-2z" />
  </svg>
);
export const IconEarbud = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M9 4.5a4 4 0 014 4v1a3 3 0 01-3 3H9.5V19a1.5 1.5 0 01-3 0V8.5a4 4 0 012.5-4z" />
    <path d="M16.5 6.5l3 3M19.5 6.5l-3 3" opacity=".7" />
  </svg>
);
export const IconCall = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6.5 4.5l2.5 1 1 3-1.8 1.4a9 9 0 004 4L13.6 12l3 1 1 2.5c-.4 1.6-1.8 2.6-3.4 2.4A12 12 0 014.1 7.9C3.9 6.3 4.9 4.9 6.5 4.5z" />
    <path d="M4 21h3M10 21h3M17 21h3" />
  </svg>
);
export const IconSpeaker = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="7" y="3" width="10" height="18" rx="2.5" />
    <path d="M10.5 17.5h3" />
  </svg>
);
export const IconLevel = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 17v-3M12 17V10M18 17V6" />
  </svg>
);
export const IconDrift = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 13c3-5 6-5 9 0s6 5 9 0" />
  </svg>
);
export const IconHold = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7v10M20 7v10M4 12h16" />
  </svg>
);
export const IconTimer = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9v4l2.5 2M10 3h4" />
  </svg>
);
export const IconSave = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 16c4-1.5 14-1.5 18 0" />
    <path d="M12 4v13" />
    <circle cx="12" cy="4.5" r="1.8" />
  </svg>
);
export const IconNoise = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 12h3M8.5 12h3M14 12h3M19.5 12h1.5" />
  </svg>
);
export const IconPage = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6.5 3.5h8l3 3v14h-11z" />
    <path d="M9 10h6M9 13.5h6M9 17h4" />
  </svg>
);
export const IconInfo = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8v.2" />
  </svg>
);
export const IconLock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="6" y="11" width="12" height="9" rx="2" />
    <path d="M8.5 11V8a3.5 3.5 0 017 0v3" />
  </svg>
);
export const IconPlay = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M8 5.5v13l10-6.5z" />
  </svg>
);
export const IconPause = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M8.5 5.5v13M15.5 5.5v13" />
  </svg>
);
export const IconLayer = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 13q9-2.5 18 0v8H3z" />
    <path d="M3 16q9 2.5 18 0" />
  </svg>
);
export const IconWeek = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 19v-4M9.5 19v-7M14 19v-5M18.5 19V9" />
  </svg>
);
export const IconSettings = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
);
export const IconPlus = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconMix = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7h16" />
    <path d="M4 14q8-2 16 0v6H4z" />
  </svg>
);
export const IconSwap = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M7 8h12M15 4l4 4-4 4M17 16H5M9 12l-4 4 4 4" />
  </svg>
);
export const IconUp = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 14l6-6 6 6" />
  </svg>
);
export const IconShare = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);
export const IconBolt = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="5" />
    <path d="M9 12h6M12 9v6" />
  </svg>
);
export const IconAB = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 18l3.5-10L11 18M5.2 14.5h4.6M14 8h3.5a2.5 2.5 0 0 1 0 5H14zM14 13h4a2.5 2.5 0 0 1 0 5h-4z" />
  </svg>
);
export const IconVary = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 9c3 0 3-3 6-3s3 3 6 3 3-3 6-3M3 17c3 0 3-3 6-3s3 3 6 3 3-3 6-3" />
  </svg>
);
