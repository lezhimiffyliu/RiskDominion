import { PLAYER_COLORS } from '../constants';

interface VictoryScreenProps {
  gameStatus: string;
  winner: string;
  currentPlayerId: number;
  playerNames: Record<number, string>;
}

function HexOutline({ color }: { color: string }) {
  const r = 60;
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${120 + r * Math.cos(angle)},${120 + r * Math.sin(angle)}`);
  }
  return (
    <svg
      width="240"
      height="240"
      viewBox="0 0 240 240"
      style={{ position: 'absolute', opacity: 0.15 }}
    >
      <polygon points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export default function VictoryScreen({
  gameStatus,
  winner,
  currentPlayerId,
  playerNames,
}: VictoryScreenProps) {
  if (gameStatus !== 'ended') return null;

  const currentPlayerName = playerNames[currentPlayerId] ?? `Player ${currentPlayerId}`;
  const didWin = winner === currentPlayerName;

  const winnerPlayerId = Object.entries(playerNames).find(([, name]) => name === winner)?.[0];
  const winnerColor = winnerPlayerId ? (PLAYER_COLORS[Number(winnerPlayerId)] ?? '#FFD700') : '#FFD700';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10,10,26,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 400ms ease-out',
      }}
    >
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <HexOutline color={winnerColor} />

        <span
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '28px',
            color: '#FFD700',
            fontWeight: 700,
            textAlign: 'center',
            zIndex: 1,
          }}
        >
          {winner} wins!
        </span>

        <span
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '16px',
            color: '#E0E0E0',
            textAlign: 'center',
            zIndex: 1,
          }}
        >
          {didWin ? 'You win!' : 'You lose.'}
        </span>
      </div>
    </div>
  );
}
