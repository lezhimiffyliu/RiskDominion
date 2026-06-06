import { useState } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import ActionCard, { CardType } from './ActionCard';
import { MilitaryRow } from '../types';
import { getValidMilitaryTargets } from '../utils/territoryHelpers';
import { TOTAL_TERRITORIES } from '../constants';
import { DbConnection } from '../module_bindings';

interface CardHandProps {
  actionPoints: number;
  currentPlayerId: number;
  military: MilitaryRow[];
  onHighlight: (ids: number[]) => void;
  client: DbConnection | null;
}

function getCardType(index: number): CardType {
  return index % 2 === 0 ? 'military' : 'economic';
}

function getTerritoryIdFromDroppable(droppableId: string): number | null {
  const match = droppableId.match(/^territory-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

export default function CardHand({ actionPoints, currentPlayerId, military, onHighlight, client }: CardHandProps) {
  const [draggingCardType, setDraggingCardType] = useState<CardType | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const cardCount = Math.max(0, actionPoints);
  const cards: CardType[] = Array.from({ length: cardCount }, (_, i) => getCardType(i));

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { cardType: CardType; cardIndex: number } | undefined;
    if (!data) return;
    setDraggingCardType(data.cardType);
    setDraggingIndex(data.cardIndex);

    if (data.cardType === 'military') {
      const targets = getValidMilitaryTargets(military, currentPlayerId);
      onHighlight(targets);
    } else {
      const allTargets = Array.from({ length: TOTAL_TERRITORIES }, (_, i) => i + 1);
      onHighlight(allTargets);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    onHighlight([]);
    setDraggingCardType(null);
    setDraggingIndex(null);

    const { over, active } = event;
    if (!over) return;

    const territoryId = getTerritoryIdFromDroppable(String(over.id));
    if (!territoryId) return;

    const data = active.data.current as { cardType: CardType } | undefined;
    if (!data) return;

    if (data.cardType === 'military') {
      const validTargets = getValidMilitaryTargets(military, currentPlayerId);
      if (!validTargets.includes(territoryId)) return;
      callReducer('military_attack', [territoryId, currentPlayerId]);
    } else {
      callReducer('economic_invest', [territoryId, currentPlayerId]);
    }
  }

  function callReducer(name: string, args: [number, number]) {
    if (!client) return;
    try {
      if (name === 'military_attack') client.reducers.militaryAttack(args[0], args[1]);
      if (name === 'economic_invest') client.reducers.economicInvest(args[0], args[1]);
    } catch (err) {
      console.error(`Reducer ${name} failed:`, err);
    }
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '80px',
          backgroundColor: 'rgba(26,26,46,0.9)',
          borderTop: '1px solid #334455',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          zIndex: 100,
        }}
      >
        {cards.map((cardType, i) => (
          <ActionCard
            key={i}
            cardType={cardType}
            cardIndex={i}
            isDisabled={false}
            playerColor={currentPlayerId === 1 ? '#4488FF' : '#FF4444'}
          />
        ))}
        {cardCount === 0 && (
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', color: '#8899AA' }}>
            No action points - regenerating...
          </span>
        )}
      </div>

      <DragOverlay>
        {draggingCardType !== null && draggingIndex !== null ? (
          <ActionCard
            cardType={draggingCardType}
            cardIndex={draggingIndex}
            isDisabled={false}
            playerColor={currentPlayerId === 1 ? '#4488FF' : '#FF4444'}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
