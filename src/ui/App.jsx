import {useEffect, useMemo, useState} from 'react';
import {createGame, applyAction} from '../game/gameEngine.js';
import {classify} from '../game/handTypes.js';
import {decideBid, decidePlay} from '../bot/botAI.js';
import {isSupabaseConfigured, requireCurrentUserId} from '../multiplayer/supabaseClient.js';
import {createRoom, getRoom, getRoomPlayers, joinRoom, startGame, submitAction, subscribeToLobby, subscribeToRoom} from '../multiplayer/roomSync.js';
import {mullberry32} from '../game/rng.js';
import {BookOpen} from "lucide-react";
import './styles.css';

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };

// Card visuals
function Card({ card, selected, onClick, small }) {
  if (card.rank >= 16) {
    const label = card.rank === 17 ? 'BIG\nJOKER' : 'small\njoker';
    return (
      <div
        className={`card joker ${selected ? 'selected' : ''} ${small ? 'small' : ''}`}
        onClick={onClick}
        style={{ color: card.rank === 17 ? '#a92330' : '#333', whiteSpace: 'pre-line' }}
      >
        {label}
      </div>
    );
  }
  const isRed = card.suit === 'H' || card.suit === 'D';
  return (
    <div className={`card ${isRed ? 'red' : ''} ${selected ? 'selected' : ''} ${small ? 'small' : ''}`} onClick={onClick}>
      <div>{card.label}</div>
      <div>{SUIT_SYMBOL[card.suit]}</div>
    </div>
  );
}

// Player's seat and status
function Seat({ label, isLandlord, cardCount, isTurn, position }) {
  return (
    <div className={`seat ${position}`}>
      <div className="seat-name" style={{ outline: isTurn ? '2px solid #cf9f4d' : 'none' }}>
        {isLandlord && <span className="landlord-seal">地主</span>}
        {label} · {cardCount} cards
      </div>
    </div>
  );
}

// Runs one local hand against two bots. Returns the live game state + actions.
function useLocalGame(humanName) {
  const [state, setState] = useState(() => createGame([humanName, 'Bot A', 'Bot B']));
  const [message, setMessage] = useState('Bidding begins — lowest seat bids first.');

  const restartGame = () => {
    setState(createGame([humanName, 'Bot A', 'Bot B']));
    setMessage('New game started - bidding begins.');
  };

  const act = (action) => {
    setState((prev) => {
      try {
        return applyAction(prev, action);
      } catch (e) {
        setMessage(e.message);
        return prev;
      }
    });
  };

  // Bot turns run automatically on a short delay for readability.
  useEffect(() => {
    if (state.phase === 'REDEAL') {
      const timer = setTimeout(() => {
        setState(createGame([humanName, 'Bot A', 'Bot B']));
        setMessage('Everyone passed — reshuffled and redealt.');
      }, 500);
      return () => clearTimeout(timer);
    }
    if (state.phase === 'SCORING') return;

    const actorIndex = state.phase === 'BIDDING' ? state.bidTurn : state.turn;
    if (actorIndex === 0) return; // human's turn — wait for UI input

    const timer = setTimeout(() => {
      if (state.phase === 'BIDDING') {
        const amount = decideBid(state.players[actorIndex].hand, state.highestBid);
        act({ type: 'BID', playerIndex: actorIndex, amount });
        setMessage(`${state.players[actorIndex].name} ${amount ? `bids ${amount}` : 'passes'}.`);
      } else {
        const hand = state.players[actorIndex].hand;
        const choice = decidePlay(hand, state.lastPlay?.combo ?? null);
        if (choice) {
          act({ type: 'PLAY', playerIndex: actorIndex, cardIds: choice.cardIds });
          setMessage(`${state.players[actorIndex].name} plays.`);
        } else {
          act({ type: 'PASS', playerIndex: actorIndex });
          setMessage(`${state.players[actorIndex].name} passes.`);
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [state, humanName]);

  return { state, act, message, setMessage, restartGame };
}

// Bidding button visuals
function BiddingControls({ state, act, playerIndex = 0 }) {
  if (state.bidTurn !== playerIndex) return <div className="status-line">Waiting for other players to bid…</div>;
  const options = [0, 1, 2, 3].filter((n) => n === 0 || n > state.highestBid);
  return (
    <div className="bid-row">
      {options.map((n) => (
        <button key={n} className="stamp-btn" onClick={() => act({ type: 'BID', playerIndex, amount: n })}>
          {n === 0 ? 'Pass' : `Bid ${n}`}
        </button>
      ))}
    </div>
  );
}

function seatsFor(mySeat) {
  return {
    bottom: mySeat,
    left: (mySeat + 1) % 3,
    right: (mySeat + 2) % 3,
  };
}

// Displays local Dou Dizhu table
function LocalTable({ humanName }) {
  const { state, act, message, restartGame } = useLocalGame(humanName);
  const [selected, setSelected] = useState(new Set());

  const human = state.players[0];
  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedCards = human.hand.filter((c) => selected.has(c.id));
  const previewCombo = useMemo(() => classify(selectedCards), [selectedCards]);
  const displayMessage = state.phase === 'PLAYING' && state.turn === 0
    ? 'Your turn to play.'
    : message;

  const playSelected = () => {
    act({ type: 'PLAY', playerIndex: 0, cardIds: [...selected] });
    setSelected(new Set());
  };

  return (
    <div className="app-shell">
      <div className="brand">
        <span className="brand-hanzi">斗地主</span>
        <span className="brand-en">Fight the Landlord</span>
      </div>

      <div className="table-wrap">
        <Seat position="left" label={state.players[1].name} isLandlord={state.landlord === 1} cardCount={state.players[1].hand.length} isTurn={state.turn === 1} />
        <Seat position="right" label={state.players[2].name} isLandlord={state.landlord === 2} cardCount={state.players[2].hand.length} isTurn={state.turn === 2} />
        <Seat position="bottom" label={human.name} isLandlord={state.landlord === 0} cardCount={human.hand.length} isTurn={state.turn === 0} />
        <div className="center-trick">
          {state.lastPlay?.cards.map((c) => <Card key={c.id} card={c} small />)}
        </div>
      </div>

      <div className="status-line">{displayMessage}</div>

      {state.phase === 'BIDDING' && <BiddingControls state={state} act={act} />}

      {state.phase === 'PLAYING' && (
        <div className="controls">
          <button className="stamp-btn" disabled={!previewCombo} onClick={playSelected}>
            Play {previewCombo ? `(${previewCombo.type})` : ''}
          </button>
          <button
            className="stamp-btn ghost"
            disabled={!state.lastPlay || state.turn !== 0}
            onClick={() => act({ type: 'PASS', playerIndex: 0 })}
          >
            Pass
          </button>
        </div>
      )}

      {state.phase === 'SCORING' && (
        <div className="result-banner">
          <div>
            {state.players[state.winner].name} wins! {state.result.landlordWon ? 'Landlord' : 'Farmers'} take the hand
            (×{state.multiplier}, base {state.highestBid}).
          </div>
          <button className="stamp-btn" style={{ marginTop: 12}} onClick={restartGame}>
            Play Again
          </button>
        </div>
      )}

      <div className="hand-row">
        {human.hand.map((c) => (
          <Card key={c.id} card={c} selected={selected.has(c.id)} onClick={() => toggle(c.id)} />
        ))}
      </div>
    </div>
  );
}

// Displays online table
function OnlineTable({ roomId, mySeat, playerNames, seed, onPlayAgain }) {
  const [state, setState] = useState(() => createGame(playerNames, mullberry32(seed)));
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState('Bidding begins.');

  useEffect(() => {
    setState(createGame(playerNames, mullberry32(seed)));
    setSelected(new Set());
    setMessage('Bidding begins.');
  }, [playerNames, seed]);

  useEffect(() => {
    return subscribeToRoom(roomId, {
      onAction: (action) => {
        setState((prev) => {
          try {
            return applyAction(prev, action);
          } catch (error) {
            setMessage(error.message);
            return prev;
          }
        });
      },
    });
  }, [roomId]);

  const me = state.players[mySeat];
  const seatMap = seatsFor(mySeat);
  const selectedCards = me.hand.filter((c) => selected.has(c.id));
  const previewCombo = useMemo(() => classify(selectedCards), [selectedCards]);
  let displayMessage = message;

  if(state.phase === 'PLAYING'){
    displayMessage = state.turn === mySeat
      ? 'Your turn to play.'
      : `Waiting on ${playerNames[state.turn]}'s turn.`;
  }

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const act = async (action) => {
    try {
      await submitAction(roomId, mySeat, state.log.length, action);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const playSelected = async () => {
    await act({ type: 'PLAY', playerIndex: mySeat, cardIds: [...selected] });
    setSelected(new Set());
  };

  return (
    <div className="app-shell">
      <div className="table-wrap">
        <Seat position="left" label={state.players[seatMap.left].name} isLandlord={state.landlord === seatMap.left} cardCount={state.players[seatMap.left].hand.length} isTurn={state.turn === seatMap.left || state.bidTurn === seatMap.left} />
        <Seat position="right" label={state.players[seatMap.right].name} isLandlord={state.landlord === seatMap.right} cardCount={state.players[seatMap.right].hand.length} isTurn={state.turn === seatMap.right || state.bidTurn === seatMap.right} />
        <Seat position="bottom" label={me.name} isLandlord={state.landlord === mySeat} cardCount={me.hand.length} isTurn={state.turn === mySeat || state.bidTurn === mySeat} />
        <div className="center-trick">
          {state.lastPlay?.cards.map((c) => <Card key={c.id} card={c} small />)}
        </div>
      </div>

      <div className="status-line">{displayMessage}</div>

      {state.phase === 'BIDDING' && <BiddingControls state={state} act={act} playerIndex={mySeat} />}

      {state.phase === 'PLAYING' && (
        <div className="controls">
          <button className="stamp-btn" disabled={!previewCombo || state.turn !== mySeat} onClick={playSelected}>
            Play {previewCombo ? `(${previewCombo.type})` : ''}
          </button>
          <button
            className="stamp-btn ghost"
            disabled={!state.lastPlay || state.turn !== mySeat}
            onClick={() => act({ type: 'PASS', playerIndex: mySeat })}
          >
            Pass
          </button>
        </div>
      )}

      {state.phase === 'SCORING' && (
        <div className="result-banner">
          {state.players[state.winner].name} wins! {state.result.landlordWon ? 'Landlord' : 'Farmers'} take the hand
          (×{state.multiplier}, base {state.highestBid}).

          {mySeat === 0 && (
            <button className="stamp-btn" style={{ marginTop: 12 }} onClick={onPlayAgain}>
              Play Again
            </button>
          )}
          {mySeat !== 0 && (
            <div className="status-line">
              Waiting for host to start again...
            </div>
          )}
        </div>
      )}

      <div className="hand-row">
        {me.hand.map((c) => (
          <Card key={c.id} card={c} selected={selected.has(c.id)} onClick={() => toggle(c.id)} />
        ))}
      </div>
    </div>
  );
}

// Online Lobby 
function OnlineLobby({ name, onRoomActiveChange }) {
  const [code, setCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [mySeat, setMySeat] = useState(null);
  const [players, setPlayers] = useState([]);
  const [roomSeed, setRoomSeed] = useState(null);
  const [status, setStatus] = useState(
    isSupabaseConfigured
      ? 'Create a room or join one with a code.'
      : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable online play.',
  );

  const handleCreate = async () => {
    try {
      setStatus('Signing in anonymously...');
      const authedUserId = await requireCurrentUserId();
      const room = await createRoom(authedUserId, name);
      setRoomId(room.roomId);
      setMySeat(0);
      setStatus(`Room created. Waiting on players...`);
      setRoomCode(room.code);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handleJoin = async () => {
    try {
      setStatus('Signing in anonymously...');
      const authedUserId = await requireCurrentUserId();
      const room = await joinRoom(code.trim().toUpperCase(), authedUserId, name);
      setRoomId(room.roomId);
      setMySeat(room.seat);
      setStatus(`Joined room, seat ${room.seat}.`);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handleStart = async () => {
    try {
      setStatus('Starting game...');
      const seed = await startGame(roomId);
      setRoomSeed(seed);
      setStatus('Game started.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  useEffect(() => {
    onRoomActiveChange?.(Boolean(roomId));
  }, [roomId, onRoomActiveChange]);

  useEffect(() => {
    if (!roomId) return undefined;

    const refreshPlayers = async () => {
      try {
        setPlayers(await getRoomPlayers(roomId));
      } catch (error) {
        setStatus(error.message);
      }
    };

    const refreshRoom = async () => {
      try {
        const room = await getRoom(roomId);
        setRoomSeed(room.seed);
        setRoomCode(room.code);
      } catch (error) {
        setStatus(error.message);
      }
    };

    refreshRoom();
    refreshPlayers();

    return subscribeToLobby(roomId, {
      onRoomChange: (room) => setRoomSeed(room.seed),
      onPlayersChange: refreshPlayers,
    });
  }, [roomId]);

  if (roomId && roomSeed && players.length === 3) {
    const playerNames = [0, 1, 2].map((seat) => (
      players.find((player) => player.seat === seat)?.display_name ?? `Seat ${seat + 1}`
    ));
    return <OnlineTable roomId={roomId} mySeat={mySeat} playerNames={playerNames} seed={roomSeed} onPlayAgain={handleStart} />;
  }

  return (
    <div className="panel">
      <h2>Play Online</h2>
      <p className="status-line" style={{ marginTop: 0 }}>{status}</p>
      {!roomId && (
        <>
          <div className="mode-row">
            <button className="stamp-btn" disabled={!isSupabaseConfigured} onClick={handleCreate}>
              Create Room
            </button>
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label>Room Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 7F2K" />
          </div>
          <button className="stamp-btn ghost" disabled={!isSupabaseConfigured || !code} onClick={handleJoin}>
            Join Room
          </button>
        </>
      )}
      {roomId && (
        <>
          {mySeat === 0 && (
            <>
              <p className="status-line">
                Joined room. Room code: {roomCode}
              </p>
              <button className="stamp-btn" disabled={players.length < 3} onClick={handleStart}>Start Game</button>
            </>
          )}
          {mySeat !== 0 && (
            <p className="status-line">
              Waiting for host to start the game...
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('menu'); // menu | local | online
  const [name, setName] = useState('You');
  const [onlineRoomActive, setOnlineRoomActive] = useState(false);

  if(screen === 'local') return <LocalTable humanName={name || 'You'} />;
  if(screen === 'online') return(
    <div className="app-shell">
      <div className="brand">
        <span className="brand-hanzi">斗地主</span>
        <span className="brand-en">Fight the Landlord</span>
      </div>
      <OnlineLobby name={name || 'You'} onRoomActiveChange={setOnlineRoomActive} />
      <button
        className="stamp-btn ghost"
        disabled={onlineRoomActive}
        style={{marginTop: 16}}
        onClick={() => setScreen('menu')}
      >
        Back
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      <div className="brand">
        <span className="brand-hanzi">斗地主</span>
        <span className="brand-en">Fight the Landlord</span>
      </div>
      <div className="panel">
        <h2>Set up your seat</h2>
        <div className="field">
          <label>Your Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}/>
        </div>
        <div className="mode-row">
          <button className="stamp-btn" onClick={() => setScreen('local')}>Play vs Bots</button>
          <button className="stamp-btn ghost" onClick={() => setScreen('online')}>Play Online</button>
        </div>
      </div>
      <div>
        <button className="instructions-btn">
          <BookOpen size={24}/>
          <span>How to Play</span>
          </button>
      </div>
    </div>
  );
}
