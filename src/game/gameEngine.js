// gameEngine.js is the state machine of one hand of Dou Dizhu.
import { createDeck, shuffle, deal, sortHand} from './deck.js';
import { classify } from  './handTypes.js';
import { beats } from './rules.js'

export function createGame(playerNames, rng = Math.random){
    const shuffled = shuffle(createDeck(), rng);
    const {hands, kitty} = deal(shuffled);
    const firstBidder = Math.floor(rng() * 3);

    return{
        phase: 'BIDDING', // Bidding -> Playing -> Scoring
        players: playerNames.map((name, i) => ({
            id: i,
            name,
            hand: sortHand(hands[i])
        })),
        kitty,
        landlord: null,
        highestBid: 0,
        highestBidder: null,
        bidTurn: firstBidder,
        bidPasses: 0,
        turn: null,
        lastPlay: null, // {player index, combo, cards}
        passStreak: 0,
        multiplier: 1, // doubles per bomb and rocket
        winner: null,
        log: [] // stores {type, playerIndex, amount/cardID/playerIndex}
    };
};

// Create a copy of the current state after each action
function clone(state){
    return structuredClone(state);
}

/**
 * @param {'BID'|'PLAY'|'PASS'} action.type
*/
export function applyAction(state, action){
    const s = clone(state);

    if(action.type === 'BID') return applyBid(s, action);
    if(action.type === 'PLAY') return applyPlay(s, action);
    if(action.type === 'PASS') return applyPass(s, action);
    throw new Error(`Unknown error type: ${action.type}`);
}

function applyBid(s, {playerIndex, amount}){
    if(s.phase !== 'BIDDING') throw new Error('Not in bidding phase');
    if(s.bidTurn !== playerIndex) throw new Error('Not your turn to bid');
    if(amount !== 0 && amount <= s.highestBid) throw new Error('Bid must exceed current highest bid');
    if(amount > 3) throw new Error('Max bid is 3');

    if(amount === 0){
        s.bidPasses += 1;
        s.log.push({type: 'BID', playerIndex, amount});
    }else{
        s.highestBid = amount;
        s.highestBidder = playerIndex;
        s.bidPasses = 0;
        s.log.push({type: 'BID', playerIndex, amount});
    }
    const allPassesNoBid = s.highestBid === 0 && s.bidPasses >= 3;
    const bidCompletion = amount === 3 || (s.highestBidder !== null && s.bidPasses >= 2);

    if(allPassesNoBid){
        s.phase = 'REDEAL';
        return s;
    }

    if(bidCompletion){
        s.landlord = s.highestBidder;
        s.phase = 'PLAYING';
        s.turn = s.landlord;
        s.players[s.landlord].hand = sortHand([...s.players[s.landlord].hand, ...s.kitty]);
        return s;
    }

    s.bidTurn = (s.bidTurn + 1) % 3;
    return s;
}

function applyPlay(s, {playerIndex, cardIds}){
    if(s.phase !== 'PLAYING') throw new Error('Not in playing phase');
    if(s.turn !== playerIndex) throw new Error('Not your turn');

    const player = s.players[playerIndex];
    const cards = cardIds.map((id) => {
        const c = player.hand.find((h) => h.id === id);
        if(!c) throw new Error(`Card ${id} not found`);
        return c;
    });

    // Checks if the combo or play is legal
    const combo = classify(cards);
    if(!combo) throw new Error('Nort a recognized combo');
    if(!beats(combo, s.lastPlay?.combo ?? null)){
        throw new Error('This does not beat the last play');
    }

    if(combo.type === 'BOMB' || combo.type === 'ROCKET') s.multiplier *= 2;

    // Removes the cards played from hand
    const idSet = new Set(cardIds);
    player.hand = player.hand.filter((card) => !idSet.has(card.id));
    s.lastPlay = {playerIndex, combo, cards};
    s.passStreak = 0;
    s.log.push({type: 'PLAY', playerIndex, cardIds});
    
    // Player has no cards left
    if(player.hand.length === 0){
        s.phase = 'SCORING';
        s.winner = playerIndex;
        s.result = scoreGame(s);
        return s;
    }
    s.turn = (s.turn + 1) % 3;
    return s;
}

function applyPass(s, {playerIndex}){
    if(s.phase !== 'PLAYING') throw new Error('Not in playing phase');
    if(s.turn !== playerIndex) throw new Error('Not your turn');
    if(!s.lastPlay) throw new Error('Cannot pass when leading a trick');

    s.passStreak += 1;
    s.log.push({type: 'PASS', playerIndex});

    if(s.passStreak >= 2){
        // Both opponents passes -> back to whoever played last, trick clears
        s.passStreak = 0;
        s.turn = s.lastPlay.playerIndex;
        s.lastPlay = null;
    }else{
        s.turn = (s.turn + 1) % 3;
    }
    return s;
}

function scoreGame(s){
    const landlordWon = s.winner === s.landlord;
    const base = s.highestBid * s.multiplier;
    const player_scores = [0, 0, 0];
    
    for(let i = 0; i < 3; i++){
        if(i === s.landlord){
            player_scores[i] = landlordWon ? base * 2 : -base * 2;
        }else{
            player_scores[i] = landlordWon ? -base : base;
        }
    }
    return {landlordWon, base, player_scores};
}

// Determines the action of a player at a given state
export function legalFunctionsFor(s, playerIndex){
    if(s.phase === 'BIDDING') return s.bidTurn === playerIndex ? ['BID'] : [];
    if(s.phase == 'PLAYING') return s.turn === playerIndex ? ['PLAY', 'PASS'] : [];
    return [];
}
