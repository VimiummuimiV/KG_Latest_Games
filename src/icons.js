const SVG_NS = "http://www.w3.org/2000/svg";

export const icons = {
  sun: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
  `,

  moon: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  `,

  delete: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `,

  decrease: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24">
      <path d="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z" fill="currentColor"/>
    </svg>
  `,

  increase: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24">
      <path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z" fill="currentColor"/>
    </svg>
  `,

  play: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  `,

  replay: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="13 17 18 12 13 7"></polyline>
      <polyline points="6 17 11 12 6 7"></polyline>
    </svg>
  `,

  replayImmediately: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 17 20 12 15 7"></polyline>
      <polyline points="9.5 17 14.5 12 9.5 7"></polyline>
      <polyline points="4 17 9 12 4 7"></polyline>
    </svg>
  `,

  replayMore: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
      <line x1="4" y1="22" x2="4" y2="15"></line>
    </svg>
  `,

  pin: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  `,

  unpin: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
    </svg>
  `,

  sort: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="currentColor" stroke="none"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <g transform="scale(0.85) translate(2.4, 2.4)">
        <path d="M23.899,21.958L16.609,3.142c-1.512-4.142-7.711-4.139-9.222,.006L.101,21.958c-.299,.772,
        .084,1.642,.857,1.941,.773,.299,1.642-.084,1.941-.857l1.953-5.042h14.296l1.953,5.042c.299,.78,1.188,
        1.154,1.941,.857,.772-.299,1.156-1.168,.857-1.941ZM6.014,15L10.183,4.238c.697-1.668,2.933-1.672,3.632-.006l4.171,10.768H6.014Z"/>
      </g>
    </svg>
  `,

  import: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `,

  export: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
  `,

  trashNothing: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  `,

  trashSomething: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  `,

  wrap: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  `,

  scroll: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2"/>
      <line x1="2" y1="8" x2="22" y2="8"/>
      <line x1="2" y1="16" x2="22" y2="16"/>
    </svg>
  `,

  addGroup: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  `,

  renameGroup: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
    </svg>
  `,

  qualification: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="var(--rg-qualification-icon)"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="7"></circle>
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
    </svg>
  `,

  panelToggleClosed: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    </svg>
  `,

  panelToggleOpened: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
  `,

  moreHorizontal: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="1"></circle>
      <circle cx="19" cy="12" r="1"></circle>
      <circle cx="5" cy="12" r="1"></circle>
    </svg>
  `,

  broom: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="2" x2="12" y2="8.5"/>
      <path d="M12 8.5c3.63,0 6.61,2.76 6.96,6.3 0.02,0.18 -0.03,0.35 -0.16,0.49 -0.12,0.14 -0.29,0.21 -0.47,0.21l-12.66 0c-0.18,0 -0.35,-0.07 -0.47,-0.21 -0.13,-0.14 -0.18,-0.31 -0.16,-0.49 0.35,-3.54 3.33,-6.3 6.96,-6.3z"/>
      <path d="M5 15.5l14 0 1.04 5.74c0.03,0.2 -0.02,0.38 -0.14,0.53 -0.13,0.15 -0.3,0.23 -0.49,0.23l-14.81 0c-0.2,0 -0.37,-0.08 -0.49,-0.23 -0.13,-0.15 -0.18,-0.33 -0.14,-0.53l1.03 -5.74z"/>
    </svg>
  `,

  checkmark: `
    <svg xmlns="${SVG_NS}" width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="#4caf50" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `,

  dragToggle: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="5 9 2 12 5 15"></polyline>
      <polyline points="9 5 12 2 15 5"></polyline>
      <polyline points="15 19 12 22 9 19"></polyline>
      <polyline points="19 9 22 12 19 15"></polyline>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <line x1="12" y1="2" x2="12" y2="22"></line>
    </svg>
  `,

  search: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  `,

  info: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  `,

  help: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  `,

  parameters: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"></line>
      <line x1="4" y1="10" x2="4" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12" y2="3"></line>
      <line x1="20" y1="21" x2="20" y2="16"></line>
      <line x1="20" y1="12" x2="20" y2="3"></line>
      <line x1="1" y1="14" x2="7" y2="14"></line>
      <line x1="9" y1="8" x2="15" y2="8"></line>
      <line x1="17" y1="16" x2="23" y2="16"></line>
    </svg>
  `,

  refresh: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="1 4 1 10 7 10"></polyline>
      <polyline points="23 20 23 14 17 14"></polyline>
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
    </svg>
  `,

  reset: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
      <line x1="18" y1="9" x2="12" y2="15"></line>
      <line x1="12" y1="9" x2="18" y2="15"></line>
    </svg>
  `,

  paused: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="4" width="4" height="16"></rect>
      <rect x="14" y="4" width="4" height="16"></rect>
    </svg>
  `,

  playing: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
  `,

  random: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="16 3 21 3 21 8"></polyline>
      <line x1="4" y1="20" x2="21" y2="3"></line>
      <polyline points="21 16 21 21 16 21"></polyline>
      <line x1="15" y1="15" x2="21" y2="21"></line>
      <line x1="4" y1="4" x2="9" y2="9"></line>
    </svg>
  `,

  start: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polygon points="10 8 16 12 10 16 10 8"></polygon>
    </svg>
  `, 

  slash: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
    </svg>
  `,

  book: `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    </svg>
  `,
};
