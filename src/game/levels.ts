export type LevelId = 'beginner' | 'intermediate' | 'expert';

export interface Level {
  id: LevelId;
  name: string;
  width: number;
  height: number;
  bombs: number;
  rupoors: number;
  fee: number;
}

export const LEVELS: Record<LevelId, Level> = {
  beginner: { id: 'beginner', name: '초급', width: 5, height: 4, bombs: 4, rupoors: 0, fee: 30 },
  intermediate: { id: 'intermediate', name: '중급', width: 6, height: 5, bombs: 4, rupoors: 4, fee: 50 },
  expert: { id: 'expert', name: '상급', width: 8, height: 5, bombs: 8, rupoors: 8, fee: 70 },
};

export const LEVEL_ORDER: LevelId[] = ['beginner', 'intermediate', 'expert'];

export type RupeeColor = 'green' | 'blue' | 'red' | 'silver' | 'gold';

export interface RupeeInfo {
  color: RupeeColor;
  name: string;
  value: number;
  /** 주변 8칸에 있는 꽝(폭탄 + 도둑루피) 개수 범위 */
  min: number;
  max: number;
  key: string;
}

export const RUPEES: RupeeInfo[] = [
  { color: 'green', name: '녹색 루피', value: 1, min: 0, max: 0, key: '1' },
  { color: 'blue', name: '파란 루피', value: 5, min: 1, max: 2, key: '2' },
  { color: 'red', name: '붉은 루피', value: 20, min: 3, max: 4, key: '3' },
  { color: 'silver', name: '은색 루피', value: 100, min: 5, max: 6, key: '4' },
  { color: 'gold', name: '금색 루피', value: 300, min: 7, max: 8, key: '5' },
];

export const RUPEE_BY_COLOR = Object.fromEntries(RUPEES.map((r) => [r.color, r])) as Record<
  RupeeColor,
  RupeeInfo
>;

export const RUPOOR_VALUE = -10;

export type Cell =
  | { kind: 'unknown' }
  | { kind: 'rupee'; color: RupeeColor }
  | { kind: 'rupoor' }
  | { kind: 'bomb' };

export function neighbors(level: Pick<Level, 'width' | 'height'>, i: number): number[] {
  const { width: w, height: h } = level;
  const x = i % w;
  const y = Math.floor(i / w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx);
    }
  }
  return out;
}

export function emptyBoard(level: Level): Cell[] {
  return Array.from({ length: level.width * level.height }, () => ({ kind: 'unknown' }) as Cell);
}
