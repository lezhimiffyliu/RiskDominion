use spacetimedb::{table, reducer, ReducerContext, Table, ScheduleAt};
use std::time::Duration;

const MAX_ACTION_POINTS: i32 = 10;
const ACTION_REGEN_SECS: u64 = 8;
const STARTING_ACTION_POINTS: i32 = 5;
const ECONOMIC_INVEST_AMOUNT: i32 = 5;
const WIN_UNIFIED_TERRITORIES: i32 = 3;
const MIN_TROOPS: i32 = 1;

// ---- TABLES ----

#[table(name = military, public)]
pub struct Military {
    #[primary_key]
    pub territory_id: i32,
    pub owner_id: i32,
    pub troop_count: i32,
}

#[table(name = economic, public)]
pub struct Economic {
    #[primary_key]
    pub territory_id: i32,
    pub owner_id: i32,
    pub capital: i32,
}

#[table(name = players, public)]
pub struct Players {
    #[primary_key]
    pub player_id: i32,
    pub player_name: String,
    pub color: String,
    pub action_points: i32,
    pub last_regen_at: i64,
}

#[table(name = game_state, public)]
pub struct GameState {
    #[primary_key]
    pub key: String,
    pub value: String,
}

#[table(name = regenerate_schedule, scheduled(regenerate_action_points))]
pub struct RegenerateSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

// ---- REDUCERS ----

#[reducer(init)]
pub fn init(_ctx: &ReducerContext) {}

#[reducer]
pub fn start_game(ctx: &ReducerContext) {
    if ctx.db.game_state().key().find(&"status".to_string()).is_some() {
        return;
    }

    let now = ctx.timestamp.to_micros_since_unix_epoch() / 1000;

    let military_data: &[(i32, i32, i32)] = &[
        (1, 1, 10), (2, 1, 5),  (3, 1, 4),
        (4, 2, 6),  (5, 2, 10), (6, 2, 5),
        (7, 2, 4),  (8, 1, 5),  (9, 2, 6),
        (10, 1, 5), (11, 2, 8), (12, 1, 4),
    ];
    for &(tid, owner, troops) in military_data {
        ctx.db.military().insert(Military { territory_id: tid, owner_id: owner, troop_count: troops });
    }

    let economic_data: &[(i32, i32, i32)] = &[
        (1, 1, 20), (2, 2, 8),  (3, 1, 6),
        (4, 1, 10), (5, 2, 20), (6, 1, 8),
        (7, 2, 7),  (8, 2, 9),  (9, 1, 8),
        (10, 2, 10),(11, 2, 15),(12, 1, 7),
    ];
    for &(tid, owner, capital) in economic_data {
        ctx.db.economic().insert(Economic { territory_id: tid, owner_id: owner, capital });
    }

    ctx.db.players().insert(Players {
        player_id: 1,
        player_name: "Player 1".to_string(),
        color: "#4488FF".to_string(),
        action_points: STARTING_ACTION_POINTS,
        last_regen_at: now,
    });
    ctx.db.players().insert(Players {
        player_id: 2,
        player_name: "Player 2".to_string(),
        color: "#FF4444".to_string(),
        action_points: STARTING_ACTION_POINTS,
        last_regen_at: now,
    });

    ctx.db.game_state().insert(GameState { key: "status".to_string(),     value: "active".to_string() });
    ctx.db.game_state().insert(GameState { key: "winner".to_string(),     value: "".to_string() });
    ctx.db.game_state().insert(GameState { key: "started_at".to_string(), value: now.to_string() });

    ctx.db.regenerate_schedule().insert(RegenerateSchedule {
        scheduled_id: 0,
        scheduled_at: ScheduleAt::Interval(Duration::from_secs(ACTION_REGEN_SECS).into()),
    });
}

#[reducer]
pub fn military_attack(ctx: &ReducerContext, territory_id: i32, player_id: i32) -> Result<(), String> {
    if let Some(status) = ctx.db.game_state().key().find(&"status".to_string()) {
        if status.value != "active" {
            return Err(format!("game is not active (status = {})", status.value));
        }
    }
    if player_id != 1 && player_id != 2 {
        return Err(format!("invalid player_id {player_id} (expected 1 or 2)"));
    }
    if territory_id < 1 || territory_id > 12 {
        return Err(format!("territory_id {territory_id} out of range (expected 1-12)"));
    }

    let player = match ctx.db.players().player_id().find(&player_id) {
        Some(p) => p,
        None => return Err(format!("player {player_id} not found")),
    };
    if player.action_points < 1 {
        return Err(format!("player {player_id} has no action points"));
    }

    let adjacent = get_adjacent(territory_id);
    let best_adjacent = adjacent.iter()
        .filter_map(|&adj| ctx.db.military().territory_id().find(&adj))
        .filter(|m| m.owner_id == player_id)
        .max_by_key(|m| m.troop_count);

    let attacker = match best_adjacent {
        Some(a) => a,
        None => return Err(format!(
            "player {player_id} owns no territory adjacent to {territory_id} to attack from"
        )),
    };

    let target = match ctx.db.military().territory_id().find(&territory_id) {
        Some(t) => t,
        None => return Err(format!("military territory {territory_id} not found")),
    };

    ctx.db.players().player_id().update(Players {
        action_points: player.action_points - 1,
        ..player
    });

    let attacker_troops = attacker.troop_count;
    let defender_troops = target.troop_count;

    if attacker_troops > defender_troops {
        let new_troops = std::cmp::max(attacker_troops - defender_troops, MIN_TROOPS);
        ctx.db.military().territory_id().update(Military {
            territory_id,
            owner_id: player_id,
            troop_count: new_troops,
        });
        check_win_condition(ctx, player_id);
    } else {
        let new_troops = std::cmp::max(defender_troops - (attacker_troops / 2), MIN_TROOPS);
        ctx.db.military().territory_id().update(Military {
            territory_id,
            owner_id: target.owner_id,
            troop_count: new_troops,
        });
    }
    Ok(())
}

#[reducer]
pub fn economic_invest(ctx: &ReducerContext, territory_id: i32, player_id: i32) -> Result<(), String> {
    if let Some(status) = ctx.db.game_state().key().find(&"status".to_string()) {
        if status.value != "active" {
            return Err(format!("game is not active (status = {})", status.value));
        }
    }
    if player_id != 1 && player_id != 2 {
        return Err(format!("invalid player_id {player_id} (expected 1 or 2)"));
    }
    if territory_id < 1 || territory_id > 12 {
        return Err(format!("territory_id {territory_id} out of range (expected 1-12)"));
    }

    let player = match ctx.db.players().player_id().find(&player_id) {
        Some(p) => p,
        None => return Err(format!("player {player_id} not found")),
    };
    if player.action_points < 1 {
        return Err(format!("player {player_id} has no action points"));
    }

    let target = match ctx.db.economic().territory_id().find(&territory_id) {
        Some(t) => t,
        None => return Err(format!("economic territory {territory_id} not found")),
    };

    ctx.db.players().player_id().update(Players {
        action_points: player.action_points - 1,
        ..player
    });

    let current_owner = target.owner_id;
    let new_owner = if player_id != current_owner { player_id } else { current_owner };
    let new_capital = target.capital + ECONOMIC_INVEST_AMOUNT;

    ctx.db.economic().territory_id().update(Economic {
        territory_id,
        owner_id: new_owner,
        capital: new_capital,
    });

    if player_id != current_owner {
        check_win_condition(ctx, player_id);
    }
    Ok(())
}

#[reducer]
pub fn regenerate_action_points(ctx: &ReducerContext, _schedule: RegenerateSchedule) {
    let now = ctx.timestamp.to_micros_since_unix_epoch() / 1000;
    for player in ctx.db.players().iter() {
        if player.action_points < MAX_ACTION_POINTS {
            ctx.db.players().player_id().update(Players {
                action_points: player.action_points + 1,
                last_regen_at: now,
                ..player
            });
        }
    }
}

// ---- HELPERS ----

fn get_adjacent(tid: i32) -> Vec<i32> {
    match tid {
        1  => vec![2, 3, 5],
        2  => vec![1, 3, 4],
        3  => vec![1, 2, 4, 6],
        4  => vec![2, 3, 6, 7],
        5  => vec![1, 6, 8],
        6  => vec![3, 4, 5, 7, 9],
        7  => vec![4, 6],
        8  => vec![5, 9, 10],
        9  => vec![6, 8, 10, 11],
        10 => vec![8, 9, 11, 12],
        11 => vec![9, 10, 12],
        12 => vec![10, 11],
        _  => vec![],
    }
}

fn check_win_condition(ctx: &ReducerContext, new_owner: i32) {
    let mut unified_count: i32 = 0;
    for tid in 1_i32..=12 {
        let mil = ctx.db.military().territory_id().find(&tid);
        let eco = ctx.db.economic().territory_id().find(&tid);
        if let (Some(m), Some(e)) = (mil, eco) {
            if m.owner_id == new_owner && e.owner_id == new_owner {
                unified_count += 1;
            }
        }
    }

    if unified_count >= WIN_UNIFIED_TERRITORIES {
        if let Some(winner) = ctx.db.players().player_id().find(&new_owner) {
            ctx.db.game_state().key().update(GameState {
                key: "status".to_string(),
                value: "ended".to_string(),
            });
            ctx.db.game_state().key().update(GameState {
                key: "winner".to_string(),
                value: winner.player_name,
            });
        }
    }
}
