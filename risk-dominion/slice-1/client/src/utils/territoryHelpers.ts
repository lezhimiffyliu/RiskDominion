import { ADJACENCY, TERRITORY_NAMES } from '../constants';
import { MilitaryRow, EconomicRow } from '../types';

export function getAdjacentTerritories(territoryId: number): number[] {
  return ADJACENCY[territoryId] || [];
}

export function isAdjacent(territoryId: number, targetId: number): boolean {
  return getAdjacentTerritories(territoryId).includes(targetId);
}

export function countUnifiedTerritories(
  military: MilitaryRow[],
  economic: EconomicRow[],
  playerId: number,
): number {
  let count = 0;
  for (const m of military) {
    if (m.owner_id === playerId) {
      const e = economic.find((row) => row.territory_id === m.territory_id);
      if (e && e.owner_id === playerId) {
        count++;
      }
    }
  }
  return count;
}

export function getValidMilitaryTargets(
  military: MilitaryRow[],
  playerId: number,
): number[] {
  const ownedTerritories = military
    .filter((row) => row.owner_id === playerId)
    .map((row) => row.territory_id);

  const adjacentToOwned = new Set<number>();
  for (const t of ownedTerritories) {
    for (const adj of getAdjacentTerritories(t)) {
      adjacentToOwned.add(adj);
    }
  }

  return Array.from(adjacentToOwned).filter((t) => {
    const m = military.find((row) => row.territory_id === t);
    return m && m.owner_id !== playerId;
  });
}

export function getTerritoryName(territoryId: number): string {
  return TERRITORY_NAMES[territoryId] || `Territory ${territoryId}`;
}
