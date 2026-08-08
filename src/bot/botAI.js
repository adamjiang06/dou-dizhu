// botAI.js - a basic AI bot (no ML) good enough to be a reasonable practice opponent.
// Two responsibilities: decide a bid and decide a play
import {findPlayableCombos} from '../game/rules.js';

// Hand-strength score used to decide how aggressively to bid
export function evaluateHandStrength(hand){
    let score = 0;
    const byRank = new Map();
    
    for(const card of hand) byRank.set(card.rank, (byRank.get(card.rank) || 0) + 1);

    for(const [rank, count] of byRank){
        if(count === 4){        // Bomb
            score += 8;
        }
        else if(count === 3){   // Triple
            if(rank === 14) score += 1 * count;
            else if(rank === 15) score += 2 * count;
            else score += 2;
        }
        else if(count === 2){   // Pair
            if(rank === 14) score += 0.5 * count;
            else if(rank === 15) score += 1 * count;
            else score += 1;
        }  
        else if(rank === 14){   // Aces
            score += 1 * count;
        }
        else if(rank === 15){   // 2s
            score += 2 * count;
        }
        else if(rank >= 16){    // Jokers
            score += 3;
        }
    }

    if(byRank.get(16) && byRank.get(17)) score += 6; // rocket
    return score;
}

// Decide bid amount (0-3) given a hand and the cuurent highest bid
export function decideBid(hand, highestBid){
    const strength = evaluateHandStrength(hand);
    let desired = 0;
    // Need to generate to find the optimal strength
    if(strength >= 19) desired = 3;
    else if(strength >= 14) desired = 2;
    else if(strength >= 11) desired = 1;

    if(desired > highestBid) return desired;
    return 0;
}

// Decide what to play. 'lastPlay' is the combo the bot must beat or null
// if the bot is leading.
// Returns {cardIds} or null to pass
export function decidePlay(hand, lastPlay){
    const options = findPlayableCombos(hand, lastPlay ?? null);
    if(options.length === 0) return null; // must pass

    // Leading trick: play the smallest rank non-bomb combo to conserve strength,
    // preferring to play the longest combo first to shorten hand efficiently.
    if(!lastPlay){
        const nonBombs = options.filter((order) => order.combo.type !== 'BOMB' && order.combo.type !== 'ROCKET');
        const pool = nonBombs.length ? nonBombs: options;

        pool.sort((a, b) => b.cards.length - a.cards.length || a.combo.rank - b.combo.rank);
        return{cardIds: pool[0].cards.map((card) => card.id)}
    }

    // Following: prefer the cheapest combo that beats the last play; only use
    // bomb/rocket if thats the only option or if its likely worth it
    const nonBombs = options.filter((order) => order.combo.type !== 'BOMB' && order.combo.type !== 'ROCKET');
    const handAlmostEmpty = hand.length <= 4;

    if(nonBombs.length > 0){
        nonBombs.sort((a, b) => a.combo.rank - b.combo.rank);
        return{cardIds: nonBombs[0].cards.map((card) => card.id)};
    }

    if(options.length > 0 && (handAlmostEmpty || lastPlay.type === 'BOMB' || lastPlay.type === 'ROCKET')){
        options.sort((a, b) => a.combo.rank - b.combo.rank);
        return{cardIds: options[0].cards.map((card) => card.id)};
    }

    return null;
}
