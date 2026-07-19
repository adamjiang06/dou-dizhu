// handTypes.js classifies a set of selected cards into Dou Dizhu combo type
// Returns null if the selection is not a legal combo 

// Recognized types: SINGLE, PAIR, TRIPLE, TRIPLE_ONE, TRIPLE_TWO,
// STRAIGHT, STRAIGHT PAIRS, PLANE, PLANE_SINGLE, PLANE_PAIR, 
// FOUR_TWO_SINGLES, FOUR_TWO_PAIRS, BOMB, ROCKET

function isConsecutive(sortedRanks){
    for(let i = 1; i < sortedRanks.length; i++){
        if(sortedRanks[i] - sortedRanks[i - 1] !== 1) return false;
    }
    return true;
}

function countByRank(cards){
    const counts = new Map();
    for(const c of cards) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
    return counts;
}

export function classify(cards){
    if(!cards || cards.length === 0) return null;
    const num_cards = cards.length;
    const counts = countByRank(cards);
    const distinct = [...counts.keys()].sort((a, b) => a - b);
    const countValues = distinct.map((rank) => counts.get(rank));

    // Rocket: Both Jokers
    if(num_cards === 2 && distinct.includes(16) && distinct.includes(17)){
        return{type: 'ROCKET', rank: 100};
    }

    // Bomb: Four of a kind
    if(num_cards === 4 && distinct.length === 1 && counts.get(distinct[0]) === 4){
        return{type: 'BOMB', rank: distinct[0]};
    }

    // Single
    if(num_cards === 1) return{type: 'SINGLE', rank: distinct[0]};

    // Pair
    if(num_cards === 2 && distinct.length === 1){
        return{type: 'PAIR', rank: distinct[0]};
    }

    // Triple
    if(num_cards === 3 && distinct.length === 1){
        return{type: 'TRIPLE', rank: distinct[0]};
    }

    // Triple_One
    if(num_cards === 4 && distinct.length === 2){
        const triple = distinct.find((rank) => counts.get(rank) === 3);
        const single = distinct.find((rank) => counts.get(rank) === 1);
        if(triple !== undefined && single !== undefined){
            return{type: 'TRIPLE_ONE', rank: TRIPLE};
        }
    }

    // Triple_Two
    if(num_cards === 5 && distinct.length === 2){
        const triple = distinct.find((rank) => counts.get(rank) === 3);
        const pair = distinct.find((rank) => counts.get(rank) === 2);
        if(triple !== undefined && pair !== undefined){
            return{type: 'TRIPLE_TWO', rank: TRIPLE};
        }
    }

    // Straight: >= 5 consecutive singles with no 2s or Jokers
    if(num_cards >= 5 && distinct.length === num_cards && countValues.every((count) => count === 1)){
        if(isConsecutive(distinct) && distinct[distinct.length - 1] <= 14){
            return{type: 'STRAIGHT', rank: distinct[distinct.length - 1], length: distinct.length};
        }
    }

    // Straight Pairs: >= 3 consecutive pairs with no 2s or Jokers
    if(num_cards >= 6 && num_cards % 2 === 0 && distinct.length === n / 2 && countValues.every((count) => count === 2)){
        if(distinct.length >= 3 && isConsecutive(distinct) && distinct[distinct.length - 1] <= 14){
            return{type: 'STRIAGHT_PAIRS', rank: distinct[distinct.length - 1], length: distinct.length};
        }
    }

    // Plane: >= 2 consecutive triples, with an option of a single or pair
    const pureTriples = distinct.filter((rank) => counts.get(rank) === 3).sort((a, b) => a - b);
    const pairRanks = distinct.filter((rank) => counts.get(rank) === 2).sort((a, b) => a - b);
    const singleRanks = distinct.filter((rank) => counts.get(rank) === 1).sort((a, b) => a - b);
    if(pureTriples.length >= 2 && isConsecutive(pureTriples) && pureTriples[pureTriples.length - 1] <= 14){
        const numOfTriples = pureTriples.length;
        const used = numOfTriples * 3;
        const leftover = n - used;
        if(leftover === 0){
            return{type: 'PLANE', rank: pureTriples[numOfTriples - 1], length: numOfTriples};
        }
        if(leftover === numOfTriples && singleRanks.length === numOfTriples){
            return{type: 'PLANE_SINGLE', rank: pureTriples[numOfTriples - 1], length: numOfTriples};
        }
        if(leftover === 2 * numOfTriples && pairRanks.length === numOfTriples){
            return{type: 'PLANE_PAIR', rank: pureTriples[numOfTriples - 1], length: numOfTriples};
        }
    }

    // Four + two singles
}
