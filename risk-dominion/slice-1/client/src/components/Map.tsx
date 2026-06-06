import Territory from './Territory';
import { MilitaryRow, EconomicRow } from '../types';

interface MapProps {
  military: MilitaryRow[];
  economic: EconomicRow[];
  highlightedTerritories: number[];
  currentPlayerId: number;
}

// Grid layout: 3 groups of 4 territories in a honeycomb pattern
// Americas: 1,2,3,4  |  Europe-Africa: 5,6,7,8  |  Asia-Oceania: 9,10,11,12
// Each group: 2 columns x 2 rows, offset for honeycomb

const CELL_W = 110;
const CELL_H = 110;
const OFFSET_X = 55; // honeycomb horizontal offset for odd rows
const GROUP_GAP = 30;

type GridPos = { col: number; row: number; group: number };

const TERRITORY_GRID: Record<number, GridPos> = {
  1:  { group: 0, col: 0, row: 0 },
  2:  { group: 0, col: 1, row: 0 },
  3:  { group: 0, col: 0, row: 1 },
  4:  { group: 0, col: 1, row: 1 },
  5:  { group: 1, col: 0, row: 0 },
  6:  { group: 1, col: 1, row: 0 },
  7:  { group: 1, col: 0, row: 1 },
  8:  { group: 1, col: 1, row: 1 },
  9:  { group: 2, col: 0, row: 0 },
  10: { group: 2, col: 1, row: 0 },
  11: { group: 2, col: 0, row: 1 },
  12: { group: 2, col: 1, row: 1 },
};

function getXY(pos: GridPos): { x: number; y: number } {
  const groupOffsetX = pos.group * (CELL_W * 2 + GROUP_GAP);
  const honeycombOffset = pos.row % 2 === 1 ? OFFSET_X : 0;
  const x = groupOffsetX + pos.col * CELL_W + honeycombOffset;
  const y = pos.row * CELL_H;
  return { x, y };
}

const CONTINENT_TINTS = [
  { color: 'rgba(68,136,255,0.05)', label: 'Americas' },
  { color: 'rgba(255,68,68,0.05)',  label: 'Europe-Africa' },
  { color: 'rgba(255,170,0,0.05)',  label: 'Asia-Oceania' },
];

// Cross-continent adjacency lines (IDs that span groups)
const CROSS_LINES: [number, number][] = [
  [1, 5], // N. America - W. Europe
];

export default function Map({ military, economic, highlightedTerritories, currentPlayerId }: MapProps) {
  const totalW = CELL_W * 2 * 3 + GROUP_GAP * 2 + OFFSET_X + 20;
  const totalH = CELL_H * 2 + 60;

  const positions: Record<number, { x: number; y: number }> = {};
  for (let tid = 1; tid <= 12; tid++) {
    positions[tid] = getXY(TERRITORY_GRID[tid]);
  }

  return (
    <div
      style={{
        position: 'relative',
        width: `${totalW}px`,
        height: `${totalH}px`,
        margin: '0 auto',
      }}
    >
      {/* Continent tint backgrounds */}
      {CONTINENT_TINTS.map((tint, gi) => {
        const gx = gi * (CELL_W * 2 + GROUP_GAP);
        return (
          <div
            key={gi}
            style={{
              position: 'absolute',
              left: gx - 10,
              top: -10,
              width: CELL_W * 2 + OFFSET_X + 20,
              height: CELL_H * 2 + 20,
              borderRadius: '12px',
              backgroundColor: tint.color,
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* Cross-continent adjacency lines */}
      <svg
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
        width={totalW}
        height={totalH}
      >
        {CROSS_LINES.map(([a, b]) => {
          const pa = positions[a];
          const pb = positions[b];
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x + 50} y1={pa.y + 50}
              x2={pb.x + 50} y2={pb.y + 50}
              stroke="#334455"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          );
        })}
      </svg>

      {/* Territory hexagons */}
      {Array.from({ length: 12 }, (_, i) => i + 1).map((tid) => {
        const mil = military.find((r) => r.territory_id === tid);
        const eco = economic.find((r) => r.territory_id === tid);
        const pos = positions[tid];

        return (
          <div
            key={tid}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
            }}
          >
            <Territory
              territory_id={tid}
              military_owner={mil?.owner_id ?? 0}
              troop_count={mil?.troop_count ?? 0}
              economic_owner={eco?.owner_id ?? 0}
              capital={eco?.capital ?? 0}
              isHighlighted={highlightedTerritories.includes(tid)}
              currentPlayerId={currentPlayerId}
            />
          </div>
        );
      })}
    </div>
  );
}
