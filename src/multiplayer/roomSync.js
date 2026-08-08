// roomSync.js - thin glue betwwen Supabase and the pure gameEngine reducer
// Nobody's state is authoritative except the order action log
// thus this file never trusts peer's compute state, only their submitted actions
import {supabase} from './supabaseClient.js';
import {createGame, applyAction} from '../game/gameEngine.js';
import {mullberry32, randomSeed} from '../game/rng.js';

// Room code generation
function randomCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Host creates room and takes seat 0. Returns {roomId, code}
export async function createRoom(userId, displayName){
    const code = randomCode();
    const {data: room, error} = await supabase
        .from('rooms')
        .insert({code})
        .select()
        .single();
    if (error) throw error;

    // Host player's entry
    await supabase.from('room_players').insert({
        room_id: room.id,
        seat: 0,
        user_id: userId,
        display_name: displayName
    });

    return {roomId: room.id, code: room.code};
}

// A second and third player joins by code and takes the next open seat
export async function joinRoom(code, userId, displayName){
    const {data: room, error} = await supabase
        .from('rooms')
        .select()
        .eq('code', code)
        .single();
    if (error) throw error;

    const {data: existing} = await supabase 
        .from('room_players')
        .select('seat')
        .eq('room_id', room.id);

    const takenSeats = new Set((existing ?? []).map((player) => player.seat));
    const seat = [0, 1, 2].find((seat) => !takenSeats.has(seat));
    if(seat === undefined) throw new Error('Room is full');

    await supabase.from('room_players').insert({
        room_id: room.id,
        seat,
        user_id: userId,
        display_name: displayName
    });

    return {room_Id: room.id, seat};
}

// Host calls this once all three seats are filled (Bots can occupy empty seats)
export async function startGame(roomId){
    const seed = randomSeed();
    const {error} = await supabase
        .from('rooms')
        .update({seed, status: 'bidding'})
        .eq('id', roomId);

    if (error) throw error;
    return seed;
}

// Submit this player's move; other clients recieve it via subscription below
export async function submitAction(roomId, seat, sequence, action){
    const {error} = await supabase.from('room_actions').insert({
        room_id: roomId,
        seat,
        sequence, 
        action
    });
    if (error) throw error;
}

// Subscribes to a room's action log. 'onAction' fires for every action 
// in order including old actions already included in the DB.
// Returns an unsubscribe function.
export function subscribeToRoom(roomId, {onAction, onSeed}){
    let nextExpectedSeq = 0;
    const buffer = new Map();

    // Processes each sequence of actions in order
    const flush = () => {
        while(buffer.has(nextExpectedSeq)){
            onAction(buffer.get(nextExpectedSeq));
            buffer.delete(nextExpectedSeq);
            nextExpectedSeq += 1;
        }
    }

    // Loads all previous actions 
    supabase
        .from('room_actions')
        .select('sequence, action')
        .eq('room_id', roomId)
        .order('sequence', {ascending: true})
        .then(({data}) => {
            for(const row of data ?? []) buffer.set(row.sequence, row.action);
            flush();
        });
    
    // Listens to player action and changes to the room 
    const channel = supabase
        .channel(`room:${roomId}`)
        .on(
            'postgres_changes',
            {event: 'INSERT', schema: 'public', table: 'room_actions', filter: `room_id=eq.${roomId}`},
            (payload) => {
                buffer.set(payload.new.sequence, payload.new.action);
                flush();
            }
        )   
        .on(
            'postgres_changes',
            {event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_id=eq.${roomId}`},
            (payload) => {
                if(payload.new.seed) onSeed?.(payload.new.seed);
            }
        )
        .subscribe();

    return () => supabase.removeChannel(channel);
}

// Rebuilds game state from scratch by replaying the full log - used on reconnect
export function replayGame(playerNames, seed, actions){
    let state = createGame(playerNames, mullberry32(seed));
    for(const action of actions){
        state = applyAction(state, action);
    }
    return state;
}