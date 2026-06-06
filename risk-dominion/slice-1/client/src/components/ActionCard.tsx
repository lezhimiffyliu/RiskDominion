import React from 'react';
import { useDraggable } from '@dnd-kit/core';

export type CardType = 'military' | 'economic';

interface ActionCardProps {
  cardType: CardType;
  cardIndex: number;
  isDisabled: boolean;
  playerColor: string;
}

function MilitaryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <polygon
        points="10,3 17,16 3,16"
        fill="none"
        stroke="#FF6666"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EconomicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="7" fill="none" stroke="#FFCC44" strokeWidth="2" />
      <line x1="10" y1="2" x2="10" y2="18" stroke="#FFCC44" strokeWidth="2" />
    </svg>
  );
}

export default function ActionCard({ cardType, cardIndex, isDisabled }: ActionCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card-${cardIndex}`,
    data: { cardType, cardIndex },
    disabled: isDisabled,
  });

  const isMilitary = cardType === 'military';
  const accentColor = isMilitary ? '#FF6666' : '#FFCC44';
  const label = isMilitary ? 'ATTACK' : 'INVEST';

  const style: React.CSSProperties = {
    width: '90px',
    height: '55px',
    borderRadius: '8px',
    backgroundColor: '#1A1A2E',
    borderLeft: `3px solid ${accentColor}`,
    boxShadow: isDisabled
      ? 'none'
      : isDragging
      ? '0 4px 16px rgba(0,0,0,0.5)'
      : '0 2px 8px rgba(0,0,0,0.3)',
    opacity: isDisabled ? 0.35 : isDragging ? 0.85 : 1,
    cursor: isDisabled ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    position: 'relative',
    transform: transform
      ? `translate(${transform.x}px, ${transform.y}px) rotate(${isDragging ? '2deg' : '0deg'})`
      : isDragging ? 'rotate(2deg)' : undefined,
    transition: isDragging ? undefined : 'transform 200ms ease-out',
    zIndex: isDragging ? 1000 : undefined,
    userSelect: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {/* Cost indicator */}
      <div
        style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          border: '1px solid #8899AA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#8899AA' }}>
          1
        </span>
      </div>

      {isMilitary ? <MilitaryIcon /> : <EconomicIcon />}

      <span
        style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: '11px',
          color: '#E0E0E0',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
    </div>
  );
}
