import type { JSX, SVGProps } from 'react'

const paths: Record<string, JSX.Element> = {
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9.5 4v16" />
    </>
  ),
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="M5 9l7 7 7-7" />,
  zoomIn: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2M8.5 11h5" />
    </>
  ),
  fitWidth: (
    <>
      <path d="M3 6v12M21 6v12" />
      <path d="M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3" />
    </>
  ),
  fitPage: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 9h6M9 12h6M9 15h3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  select: <path d="M6.5 3.4l12.2 7.9-5.5 1.3-2.3 5.6z" />,
  highlight: (
    <>
      <path d="M4 19.5l1-4.5L14.5 5.5a2.1 2.1 0 013 3l-9.5 9.5L4 19.5z" />
      <path d="M12.5 7.5l4 4" />
    </>
  ),
  underline: (
    <>
      <path d="M7 4v7a5 5 0 0010 0V4" />
      <path d="M5 20h14" />
    </>
  ),
  note: (
    <>
      <path d="M5 5.5A2.5 2.5 0 017.5 3h9A2.5 2.5 0 0119 5.5V14l-5 5H7.5A2.5 2.5 0 015 16.5v-11z" />
      <path d="M19 14h-3.5a1.5 1.5 0 00-1.5 1.5V19" />
    </>
  ),
  pen: (
    <>
      <path d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4 11.5-11.5z" />
      <path d="M14 6l4 4" />
    </>
  ),
  signature: (
    <>
      <path d="M3 17c2.5 0 3-9 5.5-9S10 17 12.5 17s2-4 3.5-4S18 16 21 15" />
      <path d="M4 21h16" />
    </>
  ),
  save: (
    <>
      <path d="M5 4.5h11L19.5 8v11.5H5z" />
      <path d="M8.5 4.5v5h7v-5M8.5 19.5V14h7v5.5" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="7" rx="2" />
      <path d="M7 14h10v6H7z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  pages: (
    <>
      <path d="M5 5h11a2 2 0 012 2v12H7a2 2 0 01-2-2z" />
      <path d="M9 2h10a2 2 0 012 2v12M9 10h6M9 14h6" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h7l5 5v12H6z" />
      <path d="M13 3.5v5h5" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 6.5A1.5 1.5 0 015 5h4l2 2.5h8a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0119 19.5H5A1.5 1.5 0 013.5 18z" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9L17.5 7" />
      <path d="M10.5 11v5M13.5 11v5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  upload: (
    <>
      <path d="M12 16V4M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 10-1.2 5.2" />
      <path d="M20 5v6h-6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5l7 2.5v5c0 4.2-2.9 8-7 9.5-4.1-1.5-7-5.3-7-9.5V6z" />
    </>
  )
}

export type IconName = keyof typeof paths

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 18, ...rest }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  )
}
