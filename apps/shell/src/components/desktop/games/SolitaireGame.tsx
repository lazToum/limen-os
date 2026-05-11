import { useMemo, useState } from "react";

type Suit = "hearts" | "diamonds" | "clubs" | "spades";

interface Card {
  id: string;
  suit: Suit;
  rank: number;
  faceUp: boolean;
}

interface GameState {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  selected: Selection | null;
  status: string;
}

type Selection =
  | { kind: "waste" }
  | { kind: "foundation"; pile: number }
  | { kind: "tableau"; pile: number; index: number };

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

function rankLabel(rank: number): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

function isRed(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, faceUp: false });
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function newGame(): GameState {
  const deck = buildDeck();
  const tableau: Card[][] = Array.from({ length: 7 }, () => []);
  for (let pile = 0; pile < 7; pile += 1) {
    for (let depth = 0; depth <= pile; depth += 1) {
      const card = deck.pop();
      if (!card) continue;
      tableau[pile].push({ ...card, faceUp: depth === pile });
    }
  }

  return {
    stock: deck,
    waste: [],
    foundations: Array.from({ length: 4 }, () => []),
    tableau,
    selected: null,
    status:
      "Turn cards from the stock and build up foundations from Ace to King.",
  };
}

function canPlaceOnFoundation(card: Card, pile: Card[]): boolean {
  const top = pile[pile.length - 1];
  if (!top) return card.rank === 1;
  return top.suit === card.suit && card.rank === top.rank + 1;
}

function canPlaceOnTableau(card: Card, pile: Card[]): boolean {
  const top = pile[pile.length - 1];
  if (!top) return card.rank === 13;
  return (
    top.faceUp &&
    isRed(top.suit) !== isRed(card.suit) &&
    card.rank === top.rank - 1
  );
}

function revealTableauTop(pile: Card[]): Card[] {
  if (pile.length === 0) return pile;
  const next = [...pile];
  const top = next[next.length - 1];
  if (top && !top.faceUp) next[next.length - 1] = { ...top, faceUp: true };
  return next;
}

function removeSelection(
  state: GameState,
  selection: Selection,
): { moved: Card[]; next: GameState } | null {
  if (selection.kind === "waste") {
    const card = state.waste[state.waste.length - 1];
    if (!card) return null;
    return {
      moved: [card],
      next: { ...state, waste: state.waste.slice(0, -1), selected: null },
    };
  }

  if (selection.kind === "foundation") {
    const pile = state.foundations[selection.pile];
    const card = pile[pile.length - 1];
    if (!card) return null;
    const foundations = state.foundations.map((cards, idx) =>
      idx === selection.pile ? cards.slice(0, -1) : cards,
    );
    return {
      moved: [card],
      next: { ...state, foundations, selected: null },
    };
  }

  const pile = state.tableau[selection.pile];
  const moved = pile.slice(selection.index);
  if (moved.length === 0 || !moved[0]?.faceUp) return null;
  const tableau = state.tableau.map((cards, idx) => {
    if (idx !== selection.pile) return cards;
    return revealTableauTop(cards.slice(0, selection.index));
  });
  return {
    moved,
    next: { ...state, tableau, selected: null },
  };
}

function isSelected(selection: Selection | null, target: Selection): boolean {
  if (!selection || selection.kind !== target.kind) return false;
  if (selection.kind === "waste") return true;
  if (selection.kind === "foundation" && target.kind === "foundation")
    return selection.pile === target.pile;
  if (selection.kind === "tableau" && target.kind === "tableau") {
    return selection.pile === target.pile && selection.index === target.index;
  }
  return false;
}

export function SolitaireGame() {
  const [game, setGame] = useState<GameState>(() => newGame());

  const visibleStock = useMemo(() => game.stock.length, [game.stock.length]);
  const visibleWaste = game.waste[game.waste.length - 1] ?? null;

  const drawFromStock = () => {
    setGame((prev) => {
      if (prev.stock.length === 0) {
        if (prev.waste.length === 0)
          return { ...prev, status: "No cards left to recycle." };
        const stock = prev.waste
          .map((card) => ({ ...card, faceUp: false }))
          .reverse();
        return {
          ...prev,
          stock,
          waste: [],
          selected: null,
          status: "Waste recycled into stock.",
        };
      }
      const nextCard = { ...prev.stock[prev.stock.length - 1], faceUp: true };
      return {
        ...prev,
        stock: prev.stock.slice(0, -1),
        waste: [...prev.waste, nextCard],
        selected: null,
        status: "Card drawn from stock.",
      };
    });
  };

  const selectWaste = () => {
    if (!visibleWaste) return;
    setGame((prev) => ({
      ...prev,
      selected: { kind: "waste" },
      status: "Waste card selected.",
    }));
  };

  const selectFoundation = (pile: number) => {
    const top = game.foundations[pile][game.foundations[pile].length - 1];
    if (!top) return;
    setGame((prev) => ({
      ...prev,
      selected: { kind: "foundation", pile },
      status: "Foundation card selected.",
    }));
  };

  const selectTableau = (pile: number, index: number) => {
    const card = game.tableau[pile][index];
    if (!card?.faceUp) return;
    setGame((prev) => ({
      ...prev,
      selected: { kind: "tableau", pile, index },
      status: "Tableau stack selected.",
    }));
  };

  const moveSelectionToFoundation = (pile: number) => {
    setGame((prev) => {
      if (!prev.selected) return prev;
      const extracted = removeSelection(prev, prev.selected);
      if (!extracted || extracted.moved.length !== 1)
        return {
          ...prev,
          status: "Only a single top card can move to foundation.",
        };
      const [card] = extracted.moved;
      if (!canPlaceOnFoundation(card, prev.foundations[pile]))
        return {
          ...prev,
          status: "That card does not fit on this foundation.",
        };
      const foundations = extracted.next.foundations.map((cards, idx) =>
        idx === pile ? [...cards, card] : cards,
      );
      const won = foundations.every((cards) => cards.length === 13);
      return {
        ...extracted.next,
        foundations,
        status: won
          ? "Classic Solitaire cleared."
          : `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]} moved to foundation.`,
      };
    });
  };

  const moveSelectionToTableau = (pile: number) => {
    setGame((prev) => {
      if (!prev.selected) return prev;
      const extracted = removeSelection(prev, prev.selected);
      if (!extracted) return prev;
      const firstCard = extracted.moved[0];
      if (!firstCard || !canPlaceOnTableau(firstCard, prev.tableau[pile])) {
        return { ...prev, status: "That stack cannot be placed there." };
      }
      const tableau = extracted.next.tableau.map((cards, idx) =>
        idx === pile ? [...cards, ...extracted.moved] : cards,
      );
      return {
        ...extracted.next,
        tableau,
        status: `${extracted.moved.length > 1 ? "Stack" : "Card"} moved to tableau.`,
      };
    });
  };

  const numberStyles: Record<number, string> = {
    1: "#2563eb",
    2: "#16a34a",
    3: "#dc2626",
    4: "#7c3aed",
    5: "#ea580c",
    6: "#0f766e",
    7: "#be123c",
    8: "#1d4ed8",
  };

  return (
    <div className="solitaire-root">
      <div className="solitaire-topbar">
        <div className="solitaire-status">{game.status}</div>
        <button className="wg-btn" onClick={() => setGame(newGame())}>
          New Deal
        </button>
      </div>

      <div className="solitaire-board">
        <div className="solitaire-row">
          <button className="solitaire-pile stock" onClick={drawFromStock}>
            {visibleStock > 0 ? (
              <span>{visibleStock} cards</span>
            ) : (
              <span>Recycle</span>
            )}
          </button>

          <button
            className={`solitaire-pile waste${isSelected(game.selected, { kind: "waste" }) ? " selected" : ""}`}
            onClick={selectWaste}
            disabled={!visibleWaste}
          >
            {visibleWaste ? (
              <CardFace card={visibleWaste} />
            ) : (
              <span className="solitaire-empty-label">Waste</span>
            )}
          </button>

          <div className="solitaire-foundations">
            {game.foundations.map((pile, index) => {
              const top = pile[pile.length - 1];
              return (
                <button
                  key={index}
                  className="solitaire-pile foundation"
                  onClick={() =>
                    game.selected
                      ? moveSelectionToFoundation(index)
                      : selectFoundation(index)
                  }
                >
                  {top ? (
                    <CardFace card={top} />
                  ) : (
                    <span className="solitaire-empty-label">
                      {["♠", "♥", "♦", "♣"][index]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="solitaire-tableau">
          {game.tableau.map((pile, pileIndex) => (
            <button
              key={pileIndex}
              className="solitaire-column"
              onClick={() => game.selected && moveSelectionToTableau(pileIndex)}
            >
              {pile.length === 0 ? (
                <div className="solitaire-slot">K</div>
              ) : (
                pile.map((card, cardIndex) => {
                  const selected = isSelected(game.selected, {
                    kind: "tableau",
                    pile: pileIndex,
                    index: cardIndex,
                  });
                  return (
                    <div
                      key={card.id}
                      className={`solitaire-card-wrap${selected ? " selected" : ""}`}
                      style={{ top: `${cardIndex * 28}px` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!card.faceUp) return;
                        if (game.selected) moveSelectionToTableau(pileIndex);
                        else selectTableau(pileIndex, cardIndex);
                      }}
                    >
                      {card.faceUp ? (
                        <CardFace card={card} />
                      ) : (
                        <div className="solitaire-card back" />
                      )}
                    </div>
                  );
                })
              )}
            </button>
          ))}
        </div>

        <div className="solitaire-legend">
          <span>Classic Klondike rules</span>
          <span>Build foundations A → K by suit</span>
          <span>Alternate colors in tableau</span>
        </div>
      </div>

      <div className="solitaire-number-bar">
        {Array.from({ length: 8 }, (_, idx) => (
          <span key={idx} style={{ color: numberStyles[idx + 1] }}>
            {idx + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

function CardFace({ card }: { card: Card }) {
  const red = isRed(card.suit);
  return (
    <div className={`solitaire-card${red ? " red" : ""}`}>
      <div className="solitaire-card-corner">
        <span>{rankLabel(card.rank)}</span>
        <span>{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className="solitaire-card-center">{SUIT_SYMBOL[card.suit]}</div>
    </div>
  );
}
