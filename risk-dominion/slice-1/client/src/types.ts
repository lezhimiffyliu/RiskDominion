export interface MilitaryRow {
  territory_id: number;
  owner_id: number;
  troop_count: number;
}

export interface EconomicRow {
  territory_id: number;
  owner_id: number;
  capital: number;
}

export interface PlayerRow {
  player_id: number;
  player_name: string;
  color: string;
  action_points: number;
  last_regen_at: number;
}

export interface GameStateRow {
  key: string;
  value: string;
}

export interface TerritoryState {
  territory_id: number;
  military_owner: number;
  troop_count: number;
  economic_owner: number;
  capital: number;
}
