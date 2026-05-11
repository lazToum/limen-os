/**
 * Auto-generated crossword from the chapter's word list.
 * Words are placed greedily on a grid; player fills in letters via keyboard.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";

// ── Placement engine ──────────────────────────────────────────────────────────

const G = 22; // internal grid size
type RawGrid = (string | null)[][];

interface Placed {
  word: string;
  row: number;
  col: number;
  dir: "H" | "V";
  num: number;
}

function mkGrid(): RawGrid {
  return Array.from({ length: G }, () => Array<string | null>(G).fill(null));
}

function canPlace(
  grid: RawGrid,
  word: string,
  row: number,
  col: number,
  dir: "H" | "V",
  needCross: boolean
): boolean {
  const dr = dir === "V" ? 1 : 0;
  const dc = dir === "H" ? 1 : 0;
  const er = row + dr * (word.length - 1);
  const ec = col + dc * (word.length - 1);
  if (row < 1 || col < 1 || er >= G - 1 || ec >= G - 1) return false;
  // before & after must be clear
  if (grid[row - dr]?.[col - dc] != null) return false;
  if (grid[er + dr]?.[ec + dc] != null) return false;
  let crosses = 0;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i, c = col + dc * i;
    const cell = grid[r][c];
    if (cell != null) {
      if (cell !== word[i]) return false;
      crosses++;
    } else {
      // perpendicular neighbors must be clear (prevent adjacent parallel words)
      if (grid[r - dc]?.[c - dr] != null) return false;
      if (grid[r + dc]?.[c + dr] != null) return false;
    }
  }
  return !needCross || crosses > 0;
}

function stamp(grid: RawGrid, word: string, row: number, col: number, dir: "H" | "V") {
  const dr = dir === "V" ? 1 : 0, dc = dir === "H" ? 1 : 0;
  for (let i = 0; i < word.length; i++) grid[row + dr * i][col + dc * i] = word[i];
}

function buildCrossword(words: string[]): { placed: Placed[]; grid: RawGrid } {
  const sorted = [...words].sort((a, b) => b.length - a.length);
  const grid = mkGrid();
  const placed: Placed[] = [];
  if (!sorted.length) return { placed, grid };

  // First word: horizontal center
  const w0 = sorted[0];
  const r0 = Math.floor(G / 2), c0 = Math.floor((G - w0.length) / 2);
  stamp(grid, w0, r0, c0, "H");
  placed.push({ word: w0, row: r0, col: c0, dir: "H", num: 1 });

  for (let wi = 1; wi < sorted.length; wi++) {
    const word = sorted[wi];
    let best: { r: number; c: number; dir: "H" | "V"; score: number } | null = null;

    for (const pw of placed) {
      const nd: "H" | "V" = pw.dir === "H" ? "V" : "H";
      const pdr = pw.dir === "V" ? 1 : 0, pdc = pw.dir === "H" ? 1 : 0;
      const ndr = nd === "V" ? 1 : 0, ndc = nd === "H" ? 1 : 0;

      for (let wi2 = 0; wi2 < word.length; wi2++) {
        for (let pi = 0; pi < pw.word.length; pi++) {
          if (word[wi2] !== pw.word[pi]) continue;
          const nr = pw.row + pdr * pi - ndr * wi2;
          const nc = pw.col + pdc * pi - ndc * wi2;
          if (!canPlace(grid, word, nr, nc, nd, true)) continue;
          const distR = Math.abs(nr + ndr * word.length / 2 - G / 2);
          const distC = Math.abs(nc + ndc * word.length / 2 - G / 2);
          const score = 30 - distR - distC;
          if (!best || score > best.score) best = { r: nr, c: nc, dir: nd, score };
        }
      }
    }

    if (best) {
      stamp(grid, word, best.r, best.c, best.dir);
      placed.push({ word, row: best.r, col: best.c, dir: best.dir, num: placed.length + 1 });
    }
  }

  return { placed, grid };
}

function trimGrid(placed: Placed[], grid: RawGrid) {
  if (!placed.length) return { rows: 0, cols: 0, rowOff: 0, colOff: 0, cells: [] as RawGrid };
  let r0 = G, r1 = 0, c0 = G, c1 = 0;
  for (const p of placed) {
    r0 = Math.min(r0, p.row);
    r1 = Math.max(r1, p.row + (p.dir === "V" ? p.word.length - 1 : 0));
    c0 = Math.min(c0, p.col);
    c1 = Math.max(c1, p.col + (p.dir === "H" ? p.word.length - 1 : 0));
  }
  const cells = grid.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1));
  return { rows: r1 - r0 + 1, cols: c1 - c0 + 1, rowOff: r0, colOff: c0, cells };
}

// Which placed words pass through a given (trimmed) cell?
function wordsAt(r: number, c: number, rowOff: number, colOff: number, placed: Placed[]) {
  const gr = r + rowOff, gc = c + colOff;
  return placed.filter((p) => {
    if (p.dir === "H") return p.row === gr && gc >= p.col && gc < p.col + p.word.length;
    return p.col === gc && gr >= p.row && gr < p.row + p.word.length;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_WORDS = ["HUMAN","LABEL","MODEL","TRUST","ANNOTATE","FEEDBACK","DATASET","ETHICS","BIAS","REVIEW","LOOP","AGENT"];

interface Props { words?: string[] }

export function CrosswordGame({ words = DEFAULT_WORDS }: Props) {
  const { placed, grid: rawGrid } = useMemo(
    () => buildCrossword(words.map((w) => w.toUpperCase())),
    [words]
  );
  const { rows, cols, rowOff, colOff, cells } = useMemo(
    () => trimGrid(placed, rawGrid),
    [placed, rawGrid]
  );

  // Intersection cells — pre-filled as hints (cells covered by 2+ words)
  const intersectionKeys = useMemo(() => {
    const s = new Set<string>();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (wordsAt(r, c, rowOff, colOff, placed).length >= 2) s.add(`${r},${c}`);
    return s;
  }, [rows, cols, rowOff, colOff, placed]);

  const makeInitialInput = useCallback(() => {
    const inp: string[][] = Array.from({ length: rows }, () => Array(cols).fill(""));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (intersectionKeys.has(`${r},${c}`)) inp[r][c] = cells[r]?.[c] ?? "";
    return inp;
  }, [rows, cols, cells, intersectionKeys]);

  // User input grid
  const [input, setInput] = useState<string[][]>(makeInitialInput);

  // Reset input when puzzle changes
  useEffect(() => {
    setInput(makeInitialInput());
    setChecked(false);
    setRevealed(false);
    setSelected(null);
    setActiveWord(null);
  }, [rows, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [activeWord, setActiveWord] = useState<Placed | null>(null);
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  const focusCell = useCallback((r: number, c: number) => {
    inputRefs.current[r]?.[c]?.focus();
  }, []);

  const handleCellClick = useCallback((r: number, c: number) => {
    const ws = wordsAt(r, c, rowOff, colOff, placed);
    if (!ws.length) return;
    // Toggle direction if clicking same cell
    if (selected?.r === r && selected?.c === c && ws.length > 1) {
      const other = ws.find((w) => w !== activeWord) ?? ws[0];
      setActiveWord(other);
    } else {
      setActiveWord(ws[0]);
    }
    setSelected({ r, c });
    focusCell(r, c);
  }, [selected, activeWord, rowOff, colOff, placed, focusCell]);

  const advance = useCallback((r: number, c: number, aw: Placed | null) => {
    if (!aw) return;
    const nr = r + (aw.dir === "V" ? 1 : 0);
    const nc = c + (aw.dir === "H" ? 1 : 0);
    if (nr < rows && nc < cols && cells[nr]?.[nc] != null) {
      setSelected({ r: nr, c: nc });
      focusCell(nr, nc);
    }
  }, [rows, cols, cells, focusCell]);

  const retreat = useCallback((r: number, c: number, aw: Placed | null) => {
    if (!aw) return;
    const nr = r - (aw.dir === "V" ? 1 : 0);
    const nc = c - (aw.dir === "H" ? 1 : 0);
    if (nr >= 0 && nc >= 0 && cells[nr]?.[nc] != null) {
      setSelected({ r: nr, c: nc });
      focusCell(nr, nc);
    }
  }, [cells, focusCell]);

  const handleKey = useCallback((
    e: React.KeyboardEvent,
    r: number,
    c: number
  ) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      setInput((prev) => {
        const next = prev.map((row) => [...row]);
        if (next[r][c]) { next[r][c] = ""; }
        else { retreat(r, c, activeWord); }
        return next;
      });
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0],
    };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dr, dc] = arrows[e.key];
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && cells[nr]?.[nc] != null) {
        setSelected({ r: nr, c: nc });
        // Switch active word direction to match arrow
        const isHoriz = dc !== 0;
        const ws = wordsAt(nr, nc, rowOff, colOff, placed);
        const match = ws.find((w) => (isHoriz ? w.dir === "H" : w.dir === "V")) ?? ws[0];
        if (match) setActiveWord(match);
        focusCell(nr, nc);
      }
      return;
    }
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      const letter = e.key.toUpperCase();
      setInput((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = letter;
        return next;
      });
      advance(r, c, activeWord);
      setChecked(false);
    }
  }, [activeWord, rows, cols, cells, rowOff, colOff, placed, advance, retreat, focusCell]);

  const handleReveal = useCallback(() => {
    setInput(cells.map((row) => row.map((c) => c ?? "")));
    setRevealed(true);
    setChecked(false);
  }, [cells]);

  const handleReset = useCallback(() => {
    setInput(makeInitialInput());
    setChecked(false);
    setRevealed(false);
    setSelected(null);
    setActiveWord(null);
  }, [makeInitialInput]);

  const handleHint = useCallback(() => {
    if (!activeWord) return;
    const dr = activeWord.dir === "V" ? 1 : 0, dc = activeWord.dir === "H" ? 1 : 0;
    // Find first empty cell in the active word
    for (let i = 0; i < activeWord.word.length; i++) {
      const r = activeWord.row - rowOff + dr * i;
      const c = activeWord.col - colOff + dc * i;
      if ((input[r]?.[c] ?? "") === "") {
        setInput((prev) => {
          const next = prev.map((row) => [...row]);
          next[r][c] = activeWord.word[i];
          return next;
        });
        setChecked(false);
        return;
      }
    }
  }, [activeWord, rowOff, colOff, input]);

  // Number map: first cell of each placed word → its number
  const numMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of placed) m.set(`${p.row - rowOff},${p.col - colOff}`, p.num);
    return m;
  }, [placed, rowOff, colOff]);

  const activeKeys = useMemo(() => {
    if (!activeWord) return new Set<string>();
    const s = new Set<string>();
    const dr = activeWord.dir === "V" ? 1 : 0, dc = activeWord.dir === "H" ? 1 : 0;
    for (let i = 0; i < activeWord.word.length; i++) {
      s.add(`${activeWord.row - rowOff + dr * i},${activeWord.col - colOff + dc * i}`);
    }
    return s;
  }, [activeWord, rowOff, colOff]);

  const allCorrect = useMemo(() => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (cells[r]?.[c] != null && input[r]?.[c] !== cells[r][c]) return false;
    return true;
  }, [rows, cols, cells, input]);

  if (!placed.length) {
    return <div className="cw-empty">Not enough words to build a crossword.</div>;
  }

  const across = placed.filter((p) => p.dir === "H").sort((a, b) => a.num - b.num);
  const down   = placed.filter((p) => p.dir === "V").sort((a, b) => a.num - b.num);

  // Live clue mask: show letters filled in so far for a word
  const wordMask = useCallback((p: Placed) => {
    const dr = p.dir === "V" ? 1 : 0, dc = p.dir === "H" ? 1 : 0;
    return p.word.split("").map((_letter, i) => {
      const r = p.row - rowOff + dr * i, c = p.col - colOff + dc * i;
      const filled = input[r]?.[c] ?? "";
      return filled || "_";
    }).join(" ");
  }, [input, rowOff, colOff]);

  return (
    <div className="cw">
      <div className="cw-toolbar">
        <button className="cw-btn" onClick={handleReset}>Reset</button>
        <button className="cw-btn cw-btn--hint" onClick={handleHint} disabled={!activeWord || revealed}
          title="Reveal next letter of selected word">Hint</button>
        <button className="cw-btn" onClick={() => setChecked(true)} disabled={revealed}>Check</button>
        <button className="cw-btn cw-btn--reveal" onClick={handleReveal} disabled={revealed}>Reveal all</button>
        {checked && allCorrect && <span className="cw-done">Solved! 🎉</span>}
      </div>

      <div className="cw-body">
        {/* Grid */}
        <div
          className="cw-grid"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => {
              const answer = cells[r]?.[c];
              const key = `${r},${c}`;
              const num = numMap.get(key);
              const userLetter = input[r]?.[c] ?? "";
              const isActive = activeWord && activeKeys.has(key);
              const isSel = selected?.r === r && selected?.c === c;
              const isIntersect = intersectionKeys.has(key);
              const correct = checked && answer != null && userLetter === answer;
              const wrong   = checked && answer != null && userLetter !== "" && userLetter !== answer;

              if (answer == null) {
                return <div key={key} className="cw-cell cw-cell--black" />;
              }
              return (
                <div
                  key={key}
                  className={[
                    "cw-cell",
                    isIntersect ? "cw-cell--intersect" : "",
                    isActive    ? "cw-cell--word"    : "",
                    isSel       ? "cw-cell--selected" : "",
                    correct     ? "cw-cell--correct"  : "",
                    wrong       ? "cw-cell--wrong"    : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => handleCellClick(r, c)}
                >
                  {num && <span className="cw-num">{num}</span>}
                  <input
                    ref={(el) => {
                      if (!inputRefs.current[r]) inputRefs.current[r] = [];
                      inputRefs.current[r][c] = el;
                    }}
                    className="cw-input"
                    maxLength={1}
                    value={userLetter}
                    readOnly
                    onKeyDown={(e) => handleKey(e, r, c)}
                    onFocus={() => handleCellClick(r, c)}
                    aria-label={`Row ${r + 1}, column ${c + 1}${num ? `, clue ${num}` : ""}`}
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Clues */}
        <div className="cw-clues">
          <div className="cw-clues-col">
            <p className="cw-clues-head">Across</p>
            {across.map((p) => (
              <button
                key={p.num}
                className={`cw-clue${activeWord?.num === p.num ? " cw-clue--active" : ""}`}
                onClick={() => {
                  setActiveWord(p);
                  setSelected({ r: p.row - rowOff, c: p.col - colOff });
                  focusCell(p.row - rowOff, p.col - colOff);
                }}
              >
                <span className="cw-clue-num">{p.num}</span>
                <span className="cw-clue-mask">{wordMask(p)}</span>
              </button>
            ))}
          </div>
          <div className="cw-clues-col">
            <p className="cw-clues-head">Down</p>
            {down.map((p) => (
              <button
                key={p.num}
                className={`cw-clue${activeWord?.num === p.num ? " cw-clue--active" : ""}`}
                onClick={() => {
                  setActiveWord(p);
                  setSelected({ r: p.row - rowOff, c: p.col - colOff });
                  focusCell(p.row - rowOff, p.col - colOff);
                }}
              >
                <span className="cw-clue-num">{p.num}</span>
                <span className="cw-clue-mask">{wordMask(p)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
