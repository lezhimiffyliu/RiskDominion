import { useEffect, useState } from 'react';
import { useSubscriptions } from './hooks/useSubscriptions';
import Map from './components/Map';
import CardHand from './components/CardHand';
import ActionBar from './components/ActionBar';
import PlayerIndicator from './components/PlayerIndicator';
import VictoryScreen from './components/VictoryScreen';
import { MAX_ACTION_POINTS, PLAYER_COLORS } from './constants';
import { countUnifiedTerritories } from './utils/territoryHelpers';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const playerId = parseInt(params.get('player') || '1', 10);

  const { military, economic, players, gameState, client } = useSubscriptions();
  const [highlightedTerritories, setHighlightedTerritories] = useState<number[]>([]);
  const [startCalled, setStartCalled] = useState(false);

  const statusRow = gameState.find((r) => r.key === 'status');
  const winnerRow  = gameState.find((r) => r.key === 'winner');
  const gameStatus = statusRow?.value ?? '';
  const winner     = winnerRow?.value ?? '';

  const currentPlayer = players.find((p) => p.player_id === playerId);
  const actionPoints  = currentPlayer?.action_points ?? 0;
  const playerColor   = PLAYER_COLORS[playerId] ?? '#888888';
  const playerName    = currentPlayer?.player_name ?? `Player ${playerId}`;

  const unified1 = countUnifiedTerritories(military, economic, 1);
  const unified2 = countUnifiedTerritories(military, economic, 2);

  const playerNames: Record<number, string> = {};
  for (const p of players) playerNames[p.player_id] = p.player_name;

  // Call start_game once after connection when no active game exists
  useEffect(() => {
    if (startCalled) return;
    if (!client) return;
    if (gameStatus === 'active' || gameStatus === 'ended') return;
    if (gameState.length === 0) return; // still loading

    setStartCalled(true);
    try {
      client.reducers.startGame();
    } catch (err) {
      console.error('start_game failed:', err);
    }
  }, [client, gameStatus, gameState.length, startCalled]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0A0A1A',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          flexShrink: 0,
        }}
      >
        <PlayerIndicator playerId={playerId} playerName={playerName} playerColor={playerColor} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {/* Unified territory counters */}
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#8899AA' }}>
            <span style={{ color: PLAYER_COLORS[1] }}>{unified1}</span>
            {' / '}
            <span style={{ color: PLAYER_COLORS[2] }}>{unified2}</span>
            {' unified'}
          </span>
          <ActionBar
            actionPoints={actionPoints}
            maxActionPoints={MAX_ACTION_POINTS}
            playerColor={playerColor}
          />
        </div>
      </div>

      {/* Map area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 20px 100px',
          overflowX: 'auto',
        }}
      >
        <Map
          military={military}
          economic={economic}
          highlightedTerritories={highlightedTerritories}
          currentPlayerId={playerId}
        />
      </div>

      {/* Card hand (fixed at bottom) */}
      <CardHand
        actionPoints={actionPoints}
        currentPlayerId={playerId}
        military={military}
        onHighlight={setHighlightedTerritories}
        client={client}
      />

      {/* Victory overlay */}
      <VictoryScreen
        gameStatus={gameStatus}
        winner={winner}
        currentPlayerId={playerId}
        playerNames={playerNames}
      />
    </div>
  );
}
