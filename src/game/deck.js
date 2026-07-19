// deck.js represents card representation, deck creation, shuffling, and dealing

// deck rank, the higher the card, the greater the value
// 3-10 -> 3-10
// J, Q, K, A, 2 -> 11, 12, 13, 14, 15
// small joker, big joker -> 16, 17

export const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
export const RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const SMALL_JOKER = 16;
export const BIG_JOKER = 17;

export const RANK_LABEL = {
    3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 
    16: 'Small Joker', 17: 'Big Joker'
};

let uid = 0;
function makeCard(rank, suit){
    uid += 1;
    return{id: `c${uid}`, rank, suit, label: RANK_LABEL[rank] };
}

// Builds a fresh deck of unshuffled 54 cards
export function createDeck(){
    uid = 0;
    const deck = [];
    for(const suit of SUITS){
        for(const rank of RANKS){
            deck.push(makeCard(rank, suit));
        }
    }
    deck.push(makeCard(SMALL_JOKER, null));
    deck.push(makeCard(BIG_JOKER, null));
    return deck;
}

// Using the Fisher Yates shuffle
export function shuffle(cards, rng = Math.random){
    const arr = cards.slice();
    for(let i = arr.length - 1; i > 0; i -= 1){
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/*
    Deal a shuffled deck of 54-cards into 3 hands of 17 and leaving 3 cards
    that goes to whoever wins the bid
*/
export function deal(shuffledDeck){
    if(shuffledDeck.length !== 54) throw new Error('Deck must have 54 cards');
    const hands = [[], [], []]
    for(let i = 0; i < 51; i++){
        hands[i % 3].push(shuffledDeck[i]);
    }
    const kitty = shuffledDeck.slice(51, 54);
    return{hands, kitty};
}

// Sorts hand in increasing order
export function sortHand(cards){
    return cards.slice().sort((a, b) => a.rank - b.rank);
}