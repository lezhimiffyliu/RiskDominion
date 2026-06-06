import {
  AlgebraicType,
  AlgebraicValue,
  BinaryWriter,
  DbConnectionBuilder,
  DbConnectionImpl,
  ProductTypeElement,
  SubscriptionBuilderImpl,
  type CallReducerFlags,
  type SubscriptionEventContextInterface,
  type EventContextInterface,
} from '@clockworklabs/spacetimedb-sdk';

// ---- Row types ----

export interface MilitaryRow { territory_id: number; owner_id: number; troop_count: number }
export interface EconomicRow  { territory_id: number; owner_id: number; capital: number }
export interface PlayerRow    { player_id: number; player_name: string; color: string; action_points: number; last_regen_at: bigint }
export interface GameStateRow { key: string; value: string }

// ---- AlgebraicType helpers ----

function i32Type()    { return AlgebraicType.createI32Type(); }
function i64Type()    { return AlgebraicType.createI64Type(); }
function strType()    { return AlgebraicType.createStringType(); }
function elem(name: string, type: AlgebraicType) { return new ProductTypeElement(name, type); }

// ---- Table type infos ----

const militaryRowType = AlgebraicType.createProductType([
  elem('territory_id', i32Type()),
  elem('owner_id',     i32Type()),
  elem('troop_count',  i32Type()),
]);

const economicRowType = AlgebraicType.createProductType([
  elem('territory_id', i32Type()),
  elem('owner_id',     i32Type()),
  elem('capital',      i32Type()),
]);

const playersRowType = AlgebraicType.createProductType([
  elem('player_id',     i32Type()),
  elem('player_name',   strType()),
  elem('color',         strType()),
  elem('action_points', i32Type()),
  elem('last_regen_at', i64Type()),
]);

const gameStateRowType = AlgebraicType.createProductType([
  elem('key',   strType()),
  elem('value', strType()),
]);

// ---- Row deserializers ----

function toMilitary(av: AlgebraicValue): MilitaryRow {
  const p = av.asProductValue();
  return {
    territory_id: p.elements[0].asNumber(),
    owner_id:     p.elements[1].asNumber(),
    troop_count:  p.elements[2].asNumber(),
  };
}

function toEconomic(av: AlgebraicValue): EconomicRow {
  const p = av.asProductValue();
  return {
    territory_id: p.elements[0].asNumber(),
    owner_id:     p.elements[1].asNumber(),
    capital:      p.elements[2].asNumber(),
  };
}

function toPlayer(av: AlgebraicValue): PlayerRow {
  const p = av.asProductValue();
  return {
    player_id:     p.elements[0].asNumber(),
    player_name:   p.elements[1].asString(),
    color:         p.elements[2].asString(),
    action_points: p.elements[3].asNumber(),
    last_regen_at: p.elements[4].asBigInt(),
  };
}

function toGameState(av: AlgebraicValue): GameStateRow {
  const p = av.asProductValue();
  return {
    key:   p.elements[0].asString(),
    value: p.elements[1].asString(),
  };
}

// ---- Callbacks ----

type MilitaryCallback  = (ctx: EventContextInterface, row: MilitaryRow)  => void;
type EconomicCallback  = (ctx: EventContextInterface, row: EconomicRow)  => void;
type PlayerCallback    = (ctx: EventContextInterface, row: PlayerRow)    => void;
type GameStateCallback = (ctx: EventContextInterface, row: GameStateRow) => void;
type SubAppliedCb      = (ctx: SubscriptionEventContextInterface) => void;

const militaryInsertCbs:  MilitaryCallback[]  = [];
const militaryDeleteCbs:  MilitaryCallback[]  = [];
const economicInsertCbs:  EconomicCallback[]  = [];
const economicDeleteCbs:  EconomicCallback[]  = [];
const playerInsertCbs:    PlayerCallback[]    = [];
const playerDeleteCbs:    PlayerCallback[]    = [];
const gameStateInsertCbs: GameStateCallback[] = [];
const gameStateDeleteCbs: GameStateCallback[] = [];
const subAppliedCbs:      SubAppliedCb[]      = [];

// ---- RemoteModule ----

const remoteModule = {
  tables: {
    military: {
      tableName: 'military',
      rowType: militaryRowType,
      primaryKeyInfo: { colName: 'territory_id', colType: i32Type() },
    },
    economic: {
      tableName: 'economic',
      rowType: economicRowType,
      primaryKeyInfo: { colName: 'territory_id', colType: i32Type() },
    },
    players: {
      tableName: 'players',
      rowType: playersRowType,
      primaryKeyInfo: { colName: 'player_id', colType: i32Type() },
    },
    game_state: {
      tableName: 'game_state',
      rowType: gameStateRowType,
      primaryKeyInfo: { colName: 'key', colType: strType() },
    },
  },
  reducers: {
    start_game:      { reducerName: 'start_game',      argsType: AlgebraicType.createProductType([]) },
    military_attack: { reducerName: 'military_attack', argsType: AlgebraicType.createProductType([elem('territory_id', i32Type()), elem('player_id', i32Type())]) },
    economic_invest: { reducerName: 'economic_invest', argsType: AlgebraicType.createProductType([elem('territory_id', i32Type()), elem('player_id', i32Type())]) },
  },
  eventContextConstructor: (imp: DbConnectionImpl, event: unknown) => ({ db: new DbView(imp), event }),
  dbViewConstructor: (connection: DbConnectionImpl) => new DbView(connection),
  reducersConstructor: (connection: DbConnectionImpl) => new Reducers(connection),
  setReducerFlagsConstructor: () => ({}),
};

// ---- DbView ----

class DbView {
  #conn: DbConnectionImpl;
  constructor(conn: DbConnectionImpl) { this.#conn = conn; }
  getTableCache(name: string) { return (this.#conn as unknown as { getOrCreateTable: (info: unknown) => unknown }).getOrCreateTable((remoteModule.tables as Record<string, unknown>)[name]); }
}

// ---- Reducers ----

const NO_FLAGS: CallReducerFlags = 'FullUpdate';

function serializeI32Args(...vals: number[]): Uint8Array {
  const w = new BinaryWriter(4 * vals.length);
  for (const v of vals) w.writeI32(v);
  return w.getBuffer();
}

class Reducers {
  #conn: DbConnectionImpl;
  constructor(conn: DbConnectionImpl) { this.#conn = conn; }
  startGame()                                           { this.#conn.callReducer('start_game',      new Uint8Array(0),                          NO_FLAGS); }
  militaryAttack(territoryId: number, playerId: number) { this.#conn.callReducer('military_attack', serializeI32Args(territoryId, playerId), NO_FLAGS); }
  economicInvest(territoryId: number, playerId: number) { this.#conn.callReducer('economic_invest', serializeI32Args(territoryId, playerId), NO_FLAGS); }
}

// ---- DbConnection ----

export class DbConnection {
  #impl: DbConnectionImpl;
  #reducers: Reducers;

  private constructor(impl: DbConnectionImpl) {
    this.#impl = impl;
    this.#reducers = new Reducers(impl);

    // Wire up table callbacks
    this.#wireTable('military',   militaryInsertCbs,  militaryDeleteCbs,  toMilitary);
    this.#wireTable('economic',   economicInsertCbs,  economicDeleteCbs,  toEconomic);
    this.#wireTable('players',    playerInsertCbs,    playerDeleteCbs,    toPlayer);
    this.#wireTable('game_state', gameStateInsertCbs, gameStateDeleteCbs, toGameState);
  }

  #wireTable<T>(
    tableName: string,
    insertCbs: ((ctx: EventContextInterface, row: T) => void)[],
    deleteCbs: ((ctx: EventContextInterface, row: T) => void)[],
    deserialize: (av: AlgebraicValue) => T,
  ) {
    const tableInfo = (remoteModule.tables as Record<string, unknown>)[tableName];
    const cache = (this.#impl as unknown as { getOrCreateTable: (info: unknown) => { onInsert: (cb: (ctx: EventContextInterface, row: AlgebraicValue) => void) => void; onDelete: (cb: (ctx: EventContextInterface, row: AlgebraicValue) => void) => void } }).getOrCreateTable(tableInfo);
    cache.onInsert((ctx, row) => { for (const cb of insertCbs) cb(ctx, deserialize(row)); });
    cache.onDelete((ctx, row) => { for (const cb of deleteCbs) cb(ctx, deserialize(row)); });
  }

  static builder(uri: string, moduleName: string): DbConnectionBuilder<DbConnection, unknown, SubscriptionEventContextInterface> {
    return new DbConnectionBuilder(remoteModule as never, (impl) => new DbConnection(impl))
      .withUri(uri)
      .withModuleName(moduleName);
  }

  subscriptionBuilder(): SubscriptionBuilderImpl {
    return (this.#impl as unknown as { subscriptionBuilder: () => SubscriptionBuilderImpl }).subscriptionBuilder();
  }

  get reducers() { return this.#reducers; }

  getAll(tableName: 'military'): MilitaryRow[];
  getAll(tableName: 'economic'): EconomicRow[];
  getAll(tableName: 'players'): PlayerRow[];
  getAll(tableName: 'game_state'): GameStateRow[];
  getAll(tableName: string): unknown[] {
    const tableInfo = (remoteModule.tables as Record<string, unknown>)[tableName];
    const cache = (this.#impl as unknown as { getOrCreateTable: (info: unknown) => { iter: () => Iterable<AlgebraicValue> } }).getOrCreateTable(tableInfo);
    const rows: unknown[] = [];
    const deserializers: Record<string, (av: AlgebraicValue) => unknown> = {
      military:   toMilitary,
      economic:   toEconomic,
      players:    toPlayer,
      game_state: toGameState,
    };
    for (const row of cache.iter()) rows.push(deserializers[tableName](row));
    return rows;
  }

  disconnect() { this.#impl.disconnect(); }
}

// ---- Public event registration ----

export const onMilitaryInsert  = (cb: MilitaryCallback)  => militaryInsertCbs.push(cb);
export const onMilitaryDelete  = (cb: MilitaryCallback)  => militaryDeleteCbs.push(cb);
export const onEconomicInsert  = (cb: EconomicCallback)  => economicInsertCbs.push(cb);
export const onEconomicDelete  = (cb: EconomicCallback)  => economicDeleteCbs.push(cb);
export const onPlayerInsert    = (cb: PlayerCallback)    => playerInsertCbs.push(cb);
export const onPlayerDelete    = (cb: PlayerCallback)    => playerDeleteCbs.push(cb);
export const onGameStateInsert = (cb: GameStateCallback) => gameStateInsertCbs.push(cb);
export const onGameStateDelete = (cb: GameStateCallback) => gameStateDeleteCbs.push(cb);
export const onSubscriptionApplied = (cb: SubAppliedCb) => subAppliedCbs.push(cb);
