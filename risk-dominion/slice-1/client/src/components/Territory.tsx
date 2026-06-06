import { useDroppable } from '@dnd-kit/core';
import { PLAYER_COLORS } from '../constants';
import { getTerritoryName } from '../utils/territoryHelpers';

interface TerritoryProps {
  territory_id: number;
  military_owner: number;
  troop_count: number;
  economic_owner: number;
  capital: number;
  isHighlighted: boolean;
  currentPlayerId: number;
}

const HEX_SIZE = 40;

// Flat-top hexagon vertices (center = 0,0)
function hexPoints(cx: number, cy: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + HEX_SIZE * Math.cos(angle), cy + HEX_SIZE * Math.sin(angle)]);
  }
  return pts;
}

function pointsStr(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

export default function Territory({
  territory_id,
  military_owner,
  troop_count,
  economic_owner,
  capital,
  isHighlighted,
  currentPlayerId,
}: TerritoryProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `territory-${territory_id}` });

  const cx = 50;
  const cy = 50;
  const verts = hexPoints(cx, cy);
  const center: [number, number] = [cx, cy];

  const milColor = PLAYER_COLORS[military_owner] ?? '#2A2A3E';
  const ecoColor = PLAYER_COLORS[economic_owner] ?? '#2A2A3E';
  const neutral = '#2A2A3E';

  // X-split: 4 triangles from center to pairs of vertices
  // v0=top-right, v1=right, v2=bottom-right, v3=bottom-left, v4=left, v5=top-left
  // Top quadrant (v5,v0): military
  // Right quadrant (v0,v2): neutral (top-right)
  // Bottom quadrant (v2,v3) + (v3,v5): economic...
  // Per spec: top-left and bottom-right = Military and Economic
  // Top-left triangle: center + v4 + v5 + v0 ...
  // Simpler: split by diagonals. Center, v0, v3 = one diagonal.
  // Top-left half (v5, v0, center, v4): Military
  // Bottom-right half (v1, v2, v3, center): Economic
  // Top-right half (v0, v1, center): neutral
  // Bottom-left half (v3, v4, center): neutral

  const topLeft  = [center, verts[4], verts[5], verts[0]]; // Military
  const botRight = [center, verts[1], verts[2], verts[3]]; // Economic
  const topRight = [center, verts[0], verts[1]];            // neutral
  const botLeft  = [center, verts[3], verts[4]];            // neutral

  const playerOwnsAny = military_owner === currentPlayerId || economic_owner === currentPlayerId;

  let strokeColor = '#334455';
  let strokeWidth = 1.5;
  if (isHighlighted || isOver) {
    strokeColor = '#FFD700';
    strokeWidth = 2;
  } else if (playerOwnsAny) {
    strokeColor = '#8899AA';
    strokeWidth = 2;
  }

  const glowFilter = (isHighlighted || isOver)
    ? 'drop-shadow(0 0 6px rgba(255,215,0,0.7))'
    : undefined;

  const svgW = cx * 2;
  const svgH = cy * 2;

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
        transition: 'transform 150ms ease-out',
        filter: glowFilter,
      }}
      className="hover:scale-105"
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ overflow: 'visible' }}
      >
        {/* Quadrant fills */}
        <polygon points={pointsStr(topLeft)}  fill={milColor} opacity={0.9} />
        <polygon points={pointsStr(botRight)} fill={ecoColor} opacity={0.9} />
        <polygon points={pointsStr(topRight)} fill={neutral}  opacity={0.9} />
        <polygon points={pointsStr(botLeft)}  fill={neutral}  opacity={0.9} />

        {/* Hex border */}
        <polygon
          points={pointsStr(verts)}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />

        {/* Internal dividers: center to each vertex */}
        {verts.map(([vx, vy], i) => (
          <line
            key={i}
            x1={cx} y1={cy} x2={vx} y2={vy}
            stroke="#334455"
            strokeWidth={0.5}
          />
        ))}

        {/* Troop count top-left area */}
        <text
          x={cx - 12}
          y={cy - 8}
          textAnchor="middle"
          fontSize="9"
          fontFamily="JetBrains Mono, monospace"
          fill="#E0E0E0"
        >
          {troop_count}
        </text>

        {/* Capital bottom-right area */}
        <text
          x={cx + 12}
          y={cy + 14}
          textAnchor="middle"
          fontSize="9"
          fontFamily="JetBrains Mono, monospace"
          fill="#E0E0E0"
        >
          {capital}
        </text>
      </svg>

      {/* Territory name label */}
      <span
        style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: '8px',
          color: '#E0E0E0',
          marginTop: '2px',
          textAlign: 'center',
          maxWidth: `${svgW}px`,
          lineHeight: 1.2,
        }}
      >
        {getTerritoryName(territory_id)}
      </span>
    </div>
  );
}
