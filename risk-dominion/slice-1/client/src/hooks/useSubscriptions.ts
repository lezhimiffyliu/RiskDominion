import { useState, useEffect, useRef } from 'react';
import {
  DbConnection,
  onMilitaryInsert, onMilitaryDelete,
  onEconomicInsert, onEconomicDelete,
  onPlayerInsert,   onPlayerDelete,
  onGameStateInsert, onGameStateDelete,
  type MilitaryRow, type EconomicRow, type PlayerRow, type GameStateRow,
} from '../module_bindings';
import { SPACETIMEDB_URI, MODULE_NAME } from '../constants';

export interface SubscriptionState {
  military:  MilitaryRow[];
  economic:  EconomicRow[];
  players:   PlayerRow[];
  gameState: GameStateRow[];
  connected: boolean;
  connectionError: string | null;
  client:    DbConnection | null;
}

function upsert<T>(arr: T[], item: T, key: keyof T): T[] {
  const idx = arr.findIndex((r) => r[key] === item[key]);
  if (idx === -1) return [...arr, item];
  const next = [...arr];
  next[idx] = item;
  return next;
}

function remove<T>(arr: T[], item: T, key: keyof T): T[] {
  return arr.filter((r) => r[key] !== item[key]);
}

export function useSubscriptions(): SubscriptionState {
  const [military,  setMilitary]  = useState<MilitaryRow[]>([]);
  const [economic,  setEconomic]  = useState<EconomicRow[]>([]);
  const [players,   setPlayers]   = useState<PlayerRow[]>([]);
  const [gameState, setGameState] = useState<GameStateRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connRef = useRef<DbConnection | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    onMilitaryInsert((_ctx, row)  => setMilitary((p) => upsert(p, row, 'territory_id')));
    onMilitaryDelete((_ctx, row)  => setMilitary((p) => remove(p, row, 'territory_id')));
    onEconomicInsert((_ctx, row)  => setEconomic((p) => upsert(p, row, 'territory_id')));
    onEconomicDelete((_ctx, row)  => setEconomic((p) => remove(p, row, 'territory_id')));
    onPlayerInsert((_ctx, row)    => setPlayers((p)   => upsert(p, row, 'player_id')));
    onPlayerDelete((_ctx, row)    => setPlayers((p)   => remove(p, row, 'player_id')));
    onGameStateInsert((_ctx, row) => setGameState((p) => upsert(p, row, 'key')));
    onGameStateDelete((_ctx, row) => setGameState((p) => remove(p, row, 'key')));

    const conn = DbConnection.builder(SPACETIMEDB_URI, MODULE_NAME)
      .onConnect(() => {
        setConnected(true);
        setConnectionError(null);
        connRef.current = conn;
        forceUpdate((n) => n + 1);

        conn.subscriptionBuilder()
          .onApplied(() => {
            // Populate initial state from table cache
            setMilitary(conn.getAll('military'));
            setEconomic(conn.getAll('economic'));
            setPlayers(conn.getAll('players'));
            setGameState(conn.getAll('game_state'));
          })
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, err) => {
        console.error('SpacetimeDB connect error:', err);
        setConnected(false);
        setConnectionError(err?.message ?? String(err));
      })
      .onDisconnect((_ctx, err) => {
        if (err) console.warn('SpacetimeDB disconnected:', err);
        setConnected(false);
        if (err) setConnectionError(err.message ?? String(err));
      })
      .build();

    return () => {
      try { conn.disconnect(); } catch (_) { /* ignore */ }
    };
  }, []);

  return {
    military,
    economic,
    players,
    gameState,
    connected,
    connectionError,
    client: connRef.current,
  };
}
