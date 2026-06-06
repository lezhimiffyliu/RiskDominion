export const MAX_ACTION_POINTS = 10;
export const ACTION_REGEN_SECONDS = 8;
export const STARTING_ACTION_POINTS = 5;
export const ECONOMIC_INVEST_AMOUNT = 5;
export const WIN_UNIFIED_TERRITORIES = 3;
export const TOTAL_TERRITORIES = 12;

export const SPACETIMEDB_URI = 'ws://localhost:3000';
export const MODULE_NAME = 'risk-dominion';

export const TERRITORY_NAMES: Record<number, string> = {
  1: 'North America', 2: 'Central America', 3: 'Caribbean',
  4: 'South America', 5: 'Western Europe', 6: 'North Africa',
  7: 'Southern Africa', 8: 'Eastern Europe', 9: 'Middle East',
  10: 'South Asia', 11: 'East Asia', 12: 'Oceania',
};

export const ADJACENCY: Record<number, number[]> = {
  1: [2, 3, 5], 2: [1, 3, 4], 3: [1, 2, 4, 6],
  4: [2, 3, 6, 7], 5: [1, 6, 8], 6: [3, 4, 5, 7, 9],
  7: [4, 6], 8: [5, 9, 10], 9: [6, 8, 10, 11],
  10: [8, 9, 11, 12], 11: [9, 10, 12], 12: [10, 11],
};

export const PLAYER_COLORS: Record<number, string> = {
  1: '#4488FF',
  2: '#FF4444',
};
