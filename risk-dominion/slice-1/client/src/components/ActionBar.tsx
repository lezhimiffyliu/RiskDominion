
interface ActionBarProps {
  actionPoints: number;
  maxActionPoints: number;
  playerColor: string;
}

export default function ActionBar({ actionPoints, maxActionPoints, playerColor }: ActionBarProps) {
  const pct = Math.min(100, (actionPoints / maxActionPoints) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
      <span
        style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: '10px',
          color: '#8899AA',
          letterSpacing: '0.05em',
        }}
      >
        ACTION POINTS
      </span>
      <div
        style={{
          width: '160px',
          height: '20px',
          borderRadius: '4px',
          border: '1px solid #8899AA',
          backgroundColor: '#2A2A3E',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: playerColor,
            transition: 'width 300ms ease-out',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12px',
            color: '#E0E0E0',
          }}
        >
          {actionPoints}/{maxActionPoints}
        </span>
      </div>
    </div>
  );
}
