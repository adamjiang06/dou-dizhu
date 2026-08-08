// rng.js - a seeded PRNG (mulberry32). Used so all players in an online room
// can independently reconstruct the same shuffled deck from one shared integer
// seed, without needing to transmit the deck itself
export function mullberry32(seed){
    let a = seed >>> 0;
    return function rng(){
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function randomSeed(){
    return Math.floor(Math.random() * 2 ** 31);
}
