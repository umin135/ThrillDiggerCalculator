import type { RupeeColor } from '../game/levels';

/** 루피 모양 보석 아이콘. 색은 CSS의 --gem / --gem-hi 변수로 정한다. */
export function gemIcon(kind: RupeeColor | 'rupoor'): string {
  return `<svg class="gem gem-${kind}" viewBox="0 0 24 24" aria-hidden="true">
    <polygon class="gem-body" points="12,1 20.5,6.5 20.5,17.5 12,23 3.5,17.5 3.5,6.5"/>
    <polygon class="gem-face" points="12,5.5 16.5,8.5 16.5,15.5 12,18.5 7.5,15.5 7.5,8.5"/>
    <polyline class="gem-shine" points="12,5.5 7.5,8.5 7.5,12"/>
  </svg>`;
}

export function bombIcon(): string {
  return `<svg class="bomb" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="10.5" cy="14" r="7.5" class="bomb-body"/>
    <circle cx="8" cy="11.5" r="2" class="bomb-shine"/>
    <path d="M15.5 8.5 L18 6" class="bomb-fuse"/>
    <path d="M19.5 2.5 L19.5 4.5 M21.5 4.5 L19.8 5.2 M17.5 3.5 L18.6 4.8" class="bomb-spark"/>
  </svg>`;
}
