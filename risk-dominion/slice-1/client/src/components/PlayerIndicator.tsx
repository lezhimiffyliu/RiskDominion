
interface PlayerIndicatorProps {
  playerId: number;
  playerName: string;
  playerColor: string;
}

export default function PlayerIndicator({ playerName, playerColor }: PlayerIndicatorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: playerColor,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: '12px',
          color: '#8899AA',
        }}
      >
        You are {playerName}
      </span>
    </div>
  );
}
