import assert from 'node:assert/strict';
import {test} from 'node:test';

import {evaluateHandStrength} from './botAI.js';
import {createDeck, deal, shuffle} from '../game/deck.js';
import {mullberry32} from '../game/rng.js';

const SAMPLE_DEALS = 5000;

const CANDIDATE_THRESHOLDS = {
    tight: {bid1: 12, bid2: 17, bid3: 20},
    balanced: {bid1: 11, bid2: 14, bid3: 19},
    loose: {bid1: 10, bid2: 13, bid3: 17},
};

function cardsFromRanks(ranks){
    return ranks.map((rank, index) => ({
        id: `test-card-${index}`,
        rank,
        suit: index % 4,
        label: String(rank),
    }));
}

function sampledScores(deals = SAMPLE_DEALS){
    const scores = [];

    for(let seed = 1; seed <= deals; seed += 1){
        const {hands} = deal(shuffle(createDeck(), mullberry32(seed)));
        for(const hand of hands){
            scores.push(evaluateHandStrength(hand));
        }
    }

    return scores.sort((a, b) => a - b);
}

function percentile(sortedScores, value){
    const index = Math.floor((sortedScores.length - 1) * value);
    return sortedScores[index];
}

function thresholdCounts(scores, {bid1, bid2, bid3}){
    const counts = [0, 0, 0, 0];

    for(const score of scores){
        const bid = score >= bid3 ? 3 : score >= bid2 ? 2 : score >= bid1 ? 1 : 0;
        counts[bid] += 1;
    }

    return counts;
}

function percent(count, total){
    return `${((count / total) * 100).toFixed(1)}%`;
}

test('evaluateHandStrength scores the important bidding features', () => {
    assert.equal(evaluateHandStrength(cardsFromRanks([16, 17])), 12, 'rocket should be the strongest feature');
    assert.equal(evaluateHandStrength(cardsFromRanks([7, 7, 7, 7])), 8, 'bomb should strongly improve a hand');
    assert.equal(evaluateHandStrength(cardsFromRanks([15, 15, 15])), 6, 'triple 2 should outrank normal triples');
    assert.equal(evaluateHandStrength(cardsFromRanks([14, 14, 14])), 3, 'triple ace should be useful but below triple 2');
    assert.equal(evaluateHandStrength(cardsFromRanks([13, 13, 13])), 2, 'normal triple has modest value');
    assert.equal(evaluateHandStrength(cardsFromRanks([15, 15])), 2, 'pair of 2s is better than a normal pair');
    assert.equal(evaluateHandStrength(cardsFromRanks([14, 14])), 1, 'pair of aces matches normal pair value');
});

test('score distribution gives usable desired bid thresholds', () => {
    const scores = sampledScores();
    const summary = {
        hands: scores.length,
        min: scores[0],
        p10: percentile(scores, 0.10),
        p25: percentile(scores, 0.25),
        p50: percentile(scores, 0.50),
        p75: percentile(scores, 0.75),
        p90: percentile(scores, 0.90),
        p95: percentile(scores, 0.95),
        p98: percentile(scores, 0.98),
        max: scores[scores.length - 1],
    };

    assert.deepEqual(summary, {
        hands: 15000,
        min: 5,
        p10: 7,
        p25: 9,
        p50: 10,
        p75: 12,
        p90: 17,
        p95: 19,
        p98: 20,
        max: 31,
    });

    console.table(summary);
    console.table(Object.entries(CANDIDATE_THRESHOLDS).map(([name, thresholds]) => {
        const counts = thresholdCounts(scores, thresholds);
        return {
            name,
            bid1At: thresholds.bid1,
            bid2At: thresholds.bid2,
            bid3At: thresholds.bid3,
            pass: percent(counts[0], scores.length),
            bid1: percent(counts[1], scores.length),
            bid2: percent(counts[2], scores.length),
            bid3: percent(counts[3], scores.length),
        };
    }));
});
