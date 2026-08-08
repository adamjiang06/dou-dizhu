-- Dou Dizhu multiplier schema (Supabase / PostgreSQL)
--
-- Design: rooms hold a shared RNG `seed` (not the deck itself) so every
-- client deals identically. Gameplay moves are an append-only log
-- (room_actions); clients replay the log through the same gameEngine.js
-- reducer used for the bot mode. This avoids last-write-wins clobbering
-- when two people act at nearly the same time, and gives you a free
-- replay/spectator log for later.

create extension if not exists "pgcrypto";

create table rooms (
    id uuid primary key default gen_random_uuid(),
    code text unique not null,               -- short room code players type to join
    status text not null default 'waiting'   -- stores current state of the game: waiting | bidding | playing | finished
        check (status in (
            'waiting',
            'bidding',
            'playing',
            'finished'
        )),  
    seed bigint,                             -- stores random seed used to shuffle cards
    owner_id uuid references auth.users(id),
    created_at timestamptz not null default now()
);

create table room_players (
    room_id uuid references rooms(id) on delete cascade,
    seat smallint not null check (seat in (0, 1, 2)),
    user_id uuid not null,                               -- the user_id comes from Supabase Auth or anonymous
    display_name text not null, 
    is_bot boolean not null default false,
    joined_at timestamptz not null default now(),
    primary key (room_id, seat)
);

-- event log
create table room_actions (
    id bigint generated always as identity primary key,  -- generates unique id for every action
    room_id uuid references rooms(id) on delete cascade,
    seat smallint not null,
    sequence int not null,                                 -- increases by one for every action
    action jsonb not null,                                 -- {type: BID | PLAY | PASS, ...}
    created_at timestamptz not null default now(),
    unique (room_id, sequence)
);

-- Row Level Security: only the seated player may insert own actions
-- rooms are readable by anyone with the code
alter table rooms enable row level security;
alter table room_actions enable row level security;
alter table room_players enable row level security;

create policy "anyone can create a room"
    on rooms for insert with check (auth.uid() = owner_id);

create policy "host can update room status/seed"
    on rooms for update using (
        auth.uid() = owner_id 
        and status = 'waiting'
    );

create policy "players readable within a room"
    on room_players for select using (true);
r
create policy "a user can seat themselves"
    on room_players for insert with check (auth.uid() = user_id);

create policy "actions readable within a room"
    on room_actions for select using (true);

create policy "a seated player can insert their own actions"
    on room_actions for insert
    with check (
        exists(
            select 1 from room_players
            where room_players.room_id = room_actions.room_id
                and room_players.seat = room_actions.seat
                and room_players.user_id = auth.uid()
        )
    );

-- Enable Realtime on the actions log so clients get pushed new moves
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table room_actions;






