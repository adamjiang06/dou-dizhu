// rules.js decides whether one combo legally beats another and generates
// candiate combos from a hand
import { classify } from "./handTypes.js";

// return true if current hand beats last hand; else return false
// last is null if 'current' is leading with a new trick
/**
 * @param {ReturnType<typeof classify>} current
 * @param {ReturnType<typeof classify>} last  - null if `current` is leading a new trick
 */
export function beats(current, last){
    if(!current) return false;
    if(!last) return true;

    if(current.type === 'ROCKET') return true;
    if(last.type === 'ROCKET') return false;

    if(current.type === 'BOMB' && last.type === 'BOMB') return current.rank > last.rank;
    if(current.type === 'BOMB') return true;
    if(last.type === 'BOMB') return false;

    if(current.type !== last.type) return false;
    if(current.length !== last.length) return false;
    return current.rank > last.rank;
}

// Group hand into ranks for combo generation
function groupByRanks(hand){
    const m = new Map();
    for(const card of hand){
        if(!m.has(card.rank)) m.set(card.rank, []);
        m.get(card.rank).push(card);
    }
    return m;
}

// Finds all consecutive sequences of ranks that are given a minimum length
function consecutiveRuns(ranks, minLen, maxRank = 14){
    const runs = [];
    const sorted = [...ranks].filter((rank) => rank <= maxRank).sort((a, b) => a - b);
    let start = 0;

    for(let i = 1; i <= sorted.length; i++){
        if(i === sorted.length || sorted[i] - sorted[i - 1] !== 1){
            const run = sorted.slice(start, i);
            if(run.length >= minLen){
                for(let len = minLen; len <= run.length; len++){
                    for(let sub = 0; sub + len <= run.length; sub++){
                        runs.push(run.slice(sub, sub + len));
                    }
                }
            }
            start = i;
        }
    }
    return runs;
}

/**
 * Generate every combo in hand that legally beats lastPlay
 * If lastPlay is null, then every combo in hand can lead
*/
export function findPlayableCombos(hand, lastPlay){
    const byRanks = groupByRanks(hand);
    const ranks = [...byRanks.keys()];
    const results = [];

    const tryAdd = (cards) => {
        const combo = classify(cards);
        if(combo && beats(combo, lastPlay)) results.push({cards, combo});
    };

    // Rockets
    const smallJoker = byRanks.get(16);
    const bigJoker = byRanks.get(17);
    if(smallJoker && bigJoker) tryAdd([smallJoker[0], bigJoker[0]]);

    // Bombs
    for(const rank of ranks){
        if(byRanks.get(rank).length == 4) tryAdd(byRanks.get(rank));
    }

    // Can lead with singles, pairs, triples, straights, consecutive pairs, and planes
    if(!lastPlay){
        for(const rank of ranks){
            tryAdd([byRanks.get(rank)[0]]);
            if(byRanks.get(rank).length >= 2) tryAdd(byRanks.get(rank).slice(0, 2));
            if(byRanks.get(rank).length >= 3) tryAdd(byRanks.get(rank).slice(0, 3));
        }
        // For straights
        for(const run of consecutiveRuns(ranks, 5)){
            tryAdd(run.map((rank) => byRanks.get(rank)[0]));
        }
        // For consecutive pairs
        for(const run of consecutiveRuns(ranks.filter((rank) => byRanks.get(rank).length >= 2), 3)){
            tryAdd(run.flatMap((rank) => byRanks.get(rank).slice(0, 2)));
        }
        // For planes
        for(const run of consecutiveRuns(ranks.filter((rank) => byRanks.get(rank).length >= 3), 2)) {
            tryAdd(run.flatMap((rank) => byRanks.get(rank).slice(0, 3)));
        }
        return results;
    }

    // Must match lastPlay's type and length 
    switch(lastPlay.type){
        case 'SINGLE':
            for(const rank of ranks) tryAdd([byRanks.get(rank)[0]]);
            break;
        case 'PAIR':
            for(const rank of ranks) if(byRanks.get(rank).length >= 2) tryAdd(byRanks.get(rank).slice(0, 2));
            break;
        case 'TRIPLE':
            for(const rank of ranks) if(byRanks.get(rank).length >= 3) tryAdd(byRanks.get(rank).slice(0, 3));
            break;
        case 'STRAIGHT':
            for(const run of consecutiveRuns(ranks, lastPlay.length)){
                if(run.length === lastPlay.length) tryAdd(run.map((rank) => byRanks.get(rank)[0]));
            }
            break;
        case 'STRAIGHT_PAIRS':
            for(const run of consecutiveRuns(ranks.filter((rank) => byRanks.get(rank).length >= 2), lastPlay.length)){
                if(run.length === lastPlay.length) tryAdd(run.flatMap((rank) => byRanks.get(rank).slice(0, 2)));
            }
            break;
        case 'PLANE':
            for(const run of consecutiveRuns(ranks.filter((rank) => byRanks.get(rank).length >= 3), lastPlay.length)){
                if(run.length === lastPlay.length) tryAdd(run.flatMap((rank) => byRanks.get(rank).slice(0, 3)));
            }
            break;
        default:
            // TRIPLE_ONE / TRIPLE_TWO / PLANE_SINGLE / PLANE_PAIR / FOUR_TWO_
            // are rarer and attachment-heavy — the bot falls back to bombs only
            // May implement later on
            break;
    }
    return results;
}
