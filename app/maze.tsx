/**
 * Enchanted Maze — Game Screen
 *
 * Mode "adventure" : seeded stages, 3 lives, ⭐ star rating, stage-clear overlay
 * Mode "time"      : chain mazes — each solved adds +15 s, score = mazes completed
 *
 * Controls: hold D-pad buttons  OR  swipe on the maze
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { generateQualityMaze, MazeGrid } from '@/utils/mazeGenerator';
import { GameProgress, TimeAttackBest } from '@/utils/gameProgress';

// ─── Layout ───────────────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const WALL = 3;

/** Columns grow with stage → smaller cells → bigger maze → harder */
function colsForStage(s: number): number {
  if (s <= 3)  return 7;   // easy     ~56 cells
  if (s <= 7)  return 9;   // medium   ~90 cells
  if (s <= 12) return 11;  // hard    ~143 cells
  if (s <= 18) return 13;  // v.hard  ~195 cells
  return 15;               // extreme ~270 cells
}

interface LayoutVals {
  COLS: number; CELL: number; ROWS: number;
  MAZE_W: number; MAZE_H: number; EMOJI_SZ: number;
}

function computeLayout(stage: number, availH: number): LayoutVals {
  const COLS    = colsForStage(stage);
  const CELL    = Math.floor((SCREEN_W - WALL * 2) / COLS);
  const ROWS    = Math.max(8, Math.floor(availH / CELL));
  const MAZE_W  = CELL * COLS + WALL * 2;
  const MAZE_H  = CELL * ROWS + WALL * 2;
  const EMOJI_SZ = Math.floor(CELL * 0.68);
  return { COLS, CELL, ROWS, MAZE_W, MAZE_H, EMOJI_SZ };
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const C_SCREEN = '#0a0118';
const C_FLOOR  = '#fdf4ff';
const C_WALL   = '#6B21A8';
const C_HUD    = '#120535';
const C_GOLD   = '#FFD700';
const C_PURPLE = '#a78bfa';

// ─── Content ──────────────────────────────────────────────────────────────────
const WORLDS = [
  'Enchanted Forest', 'Fairy Garden',    "Dragon's Cave",
  'Crystal Kingdom',  "Wizard's Tower",  'Mermaid Cove',
  "Giant's Castle",   'Phoenix Valley',  'Unicorn Meadow',
  'Rainbow Bridge',   'Star Sanctuary',  'Moon Palace',
];
const worldName = (s: number) => WORLDS[(s - 1) % WORLDS.length];
const worldEmoji = (s: number) =>
  ['🌲','🌸','🐉','💎','🧙','🧜','🏰','🔥','🦄','🌈','⭐','🌙'][(s - 1) % 12];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pad       = (n: number) => String(n).padStart(2, '0');
const fmtTime   = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
/**
 * Time per stage — scales UP with maze complexity so harder stages stay fair.
 * Within each difficulty tier it tightens slightly to keep the challenge alive.
 *
 *  Tier   cols  stages   start → end
 *  Easy     7    1-3      60 s →  45 s
 *  Medium   9    4-7      90 s →  75 s
 *  Hard    11    8-12    120 s → 105 s
 *  V.Hard  13   13-18   150 s → 135 s
 *  Extreme 15   19+     180 s → 165 s
 */
function stageTime(s: number): number {
  const cols = colsForStage(s);
  const base:      Record<number, number> = { 7: 60,  9: 90,  11: 120, 13: 150, 15: 180 };
  const tierFirst: Record<number, number> = { 7: 1,   9: 4,   11: 8,   13: 13,  15: 19  };
  const tierLen:   Record<number, number> = { 7: 3,   9: 4,   11: 5,   13: 6,   15: 100 };
  const progress = Math.min(1, (s - tierFirst[cols]) / tierLen[cols]);
  return Math.round(base[cols] - progress * 15);
}

/**
 * Candidates to generate per stage — more attempts on harder stages means
 * we keep the maze with the longest solution path (most challenging puzzle).
 */
function mazeAttempts(cols: number): number {
  if (cols <= 7)  return 3;
  if (cols <= 9)  return 5;
  if (cols <= 11) return 7;
  if (cols <= 13) return 10;
  return 12;
}

const stageSeed = (s: number, rows: number, cols: number) => s * 997 + rows * 31 + cols;

function calcStars(used: number, total: number): 1 | 2 | 3 {
  const r = used / total;
  if (r <= 0.33) return 3;
  if (r <= 0.66) return 2;
  return 1;
}

// ─── Live star preview ────────────────────────────────────────────────────────
function liveStars(timeLeft: number, total: number): 1 | 2 | 3 {
  return calcStars(total - timeLeft, total);
}

// ─── Wall builder ─────────────────────────────────────────────────────────────
function buildWalls(maze: MazeGrid, L: LayoutVals) {
  type Seg = { key: string; t: number; l: number; w: number; h: number };
  const segs: Seg[] = [];
  if (!maze || maze.length === 0) return segs;

  const { COLS, CELL, ROWS, MAZE_W } = L;
  const mh = CELL * ROWS;
  segs.push({ key: 'ot', t: 0,  l: 0,            w: MAZE_W,        h: WALL });
  segs.push({ key: 'ol', t: 0,  l: 0,             w: WALL,          h: mh + WALL });
  segs.push({ key: 'or', t: 0,  l: MAZE_W - WALL, w: WALL,          h: mh + WALL });
  segs.push({ key: 'ob', t: mh, l: 0,             w: MAZE_W - CELL, h: WALL }); // gap = exit

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = maze[r][c];
      const x = WALL + c * CELL;
      const y = WALL + r * CELL;

      if (cell.right && c < COLS - 1)
        segs.push({ key: `rw${r}_${c}`, t: y-WALL, l: x+CELL-WALL, w: WALL, h: CELL+WALL });

      if (cell.bottom && !(r === ROWS-1 && c === COLS-1))
        segs.push({ key: `bw${r}_${c}`, t: y+CELL-WALL, l: x-WALL, w: CELL+WALL, h: WALL });
    }
  }
  return segs;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MazeGame() {
  const insets = useSafeAreaInsets();
  const { mode, stage: stageParam, lives: livesParam } =
    useLocalSearchParams<{ mode?: string; stage?: string; lives?: string }>();

  const isAdventure = mode !== 'time';
  const initStage   = parseInt(stageParam || '1', 10);
  const initLives   = isAdventure ? parseInt(livesParam || '3', 10) : 1;

  // ── Layout (recomputed per stage inside initLevel, read via ref in renders) ──
  const HUD_H  = 92;
  const CTRL_H = 205;
  const availH = SCREEN_H - HUD_H - CTRL_H - insets.top - insets.bottom - 14;
  const layoutRef = useRef<LayoutVals>(computeLayout(initStage, availH));

  // ── Refs (no stale-closure issues) ──────────────────────────────────────────
  const mazeRef    = useRef<MazeGrid>([]);
  const playerRef  = useRef({ r: 0, c: 0 });
  const wonRef     = useRef(false);
  const deadRef    = useRef(false);
  const stageRef   = useRef(initStage);
  const livesRef   = useRef(initLives);
  const timeRef    = useRef(isAdventure ? stageTime(initStage) : 90);
  const timerIdRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const dpadIdRef  = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pausedRef  = useRef(false);

  const playerAnim = useRef(new Animated.ValueXY({
    x: WALL + (layoutRef.current.CELL - layoutRef.current.EMOJI_SZ) / 2,
    y: WALL + (layoutRef.current.CELL - layoutRef.current.EMOJI_SZ) / 2,
  }));
  const goalScale  = useRef(new Animated.Value(1));

  // Stage-clear animation refs
  const clearSlide = useRef(new Animated.Value(-350));
  const s1Anim     = useRef(new Animated.Value(0));
  const s2Anim     = useRef(new Animated.Value(0));
  const s3Anim     = useRef(new Animated.Value(0));
  const confettiY  = useRef(new Animated.Value(-80));
  const confettiOp = useRef(new Animated.Value(0));

  // Time Attack bonus-flash animation
  const bonusY  = useRef(new Animated.Value(0));
  const bonusOp = useRef(new Animated.Value(0));

  // ── State ───────────────────────────────────────────────────────────────────
  const [stage,     setStage]     = useState(initStage);
  const [lives,     setLives]     = useState(initLives);
  const [timeLeft,  setTimeLeft]  = useState(isAdventure ? stageTime(initStage) : 90);
  const [won,       setWon]       = useState(false);
  const [gameOver,  setGameOver]  = useState(false);
  const [paused,    setPaused]    = useState(false);
  const [clearSecs, setClearSecs] = useState(0);
  const [mazeVer,   setMazeVer]   = useState(0);
  const mazesCompletedRef = useRef(0);
  const taBestRef         = useRef(TimeAttackBest.get());
  const [mazesCompleted, setMazesCompleted] = useState(0);
  const [taBest,         setTaBest]         = useState(TimeAttackBest.get());
  const [isNewRecord,    setIsNewRecord]    = useState(false);

  // ── Load Time Attack best from disk ──────────────────────────────────────────
  useEffect(() => {
    if (!isAdventure) {
      TimeAttackBest.load().then(v => { taBestRef.current = v; setTaBest(v); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pulsing goal ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(goalScale.current, { toValue: 1.28, duration: 750, useNativeDriver: true }),
      Animated.timing(goalScale.current, { toValue: 1.0,  duration: 750, useNativeDriver: true }),
    ])).start();
  }, []);

  // ── Stage-clear animation ─────────────────────────────────────────────────
  function playClearAnim(earned: 1 | 2 | 3) {
    clearSlide.current.setValue(-350);
    s1Anim.current.setValue(0);
    s2Anim.current.setValue(0);
    s3Anim.current.setValue(0);
    confettiY.current.setValue(-80);
    confettiOp.current.setValue(0);

    // Card slides in
    Animated.spring(clearSlide.current, {
      toValue: 0, tension: 48, friction: 7, useNativeDriver: true,
    }).start();

    // Confetti floats down
    Animated.parallel([
      Animated.timing(confettiOp.current, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(confettiY.current,  { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    // Stars pop in
    setTimeout(() => Animated.spring(s1Anim.current, { toValue: 1,                    tension: 90, friction: 5, useNativeDriver: true }).start(), 480);
    setTimeout(() => Animated.spring(s2Anim.current, { toValue: earned >= 2 ? 1 : 0.35, tension: 90, friction: 5, useNativeDriver: true }).start(), 720);
    setTimeout(() => Animated.spring(s3Anim.current, { toValue: earned >= 3 ? 1 : 0.35, tension: 90, friction: 5, useNativeDriver: true }).start(), 960);
  }

  // ── Time Attack bonus flash ───────────────────────────────────────────────
  function flashBonus() {
    bonusY.current.setValue(0);
    bonusOp.current.setValue(1);
    Animated.parallel([
      Animated.timing(bonusOp.current, { toValue: 0, duration: 1400, useNativeDriver: true }),
      Animated.timing(bonusY.current,  { toValue: -80, duration: 1400, useNativeDriver: true }),
    ]).start();
  }

  // ── Timer (shared by initLevel and nextTAMaze) ────────────────────────────
  function startTimer() {
    clearInterval(timerIdRef.current);
    timerIdRef.current = setInterval(() => {
      if (wonRef.current || deadRef.current || pausedRef.current) return;
      timeRef.current -= 1;
      setTimeLeft(timeRef.current);

      if (timeRef.current <= 0) {
        clearInterval(timerIdRef.current);

        if (isAdventure) {
          const nl = livesRef.current - 1;
          livesRef.current = nl;
          setLives(nl);
          if (nl <= 0) {
            deadRef.current = true;
            GameProgress.save(stageRef.current, 3);
            setGameOver(true);
          } else {
            initLevel(stageRef.current, nl);
          }
        } else {
          // Time Attack: time ran out → game over
          const count = mazesCompletedRef.current;
          if (count > taBestRef.current) {
            TimeAttackBest.save(count);
            taBestRef.current = count;
            setTaBest(count);
            setIsNewRecord(true);
          } else {
            setIsNewRecord(false);
          }
          deadRef.current = true;
          setGameOver(true);
        }
      }
    }, 1000);
  }

  // ── Level init ────────────────────────────────────────────────────────────
  function initLevel(stg: number, curLives: number) {
    clearInterval(timerIdRef.current);

    // Recompute layout for this stage (may change COLS/CELL/ROWS)
    layoutRef.current = computeLayout(stg, availH);
    const { COLS, CELL, ROWS, EMOJI_SZ } = layoutRef.current;

    const seed = isAdventure ? stageSeed(stg, ROWS, COLS) : undefined;
    mazeRef.current   = generateQualityMaze(ROWS, COLS, seed, mazeAttempts(COLS));
    playerRef.current = { r: 0, c: 0 };
    wonRef.current    = false;
    deadRef.current   = false;
    stageRef.current  = stg;
    livesRef.current  = curLives;

    if (isAdventure) GameProgress.save(stg, curLives);

    if (!isAdventure) {
      mazesCompletedRef.current = 0;
      setMazesCompleted(0);
      setIsNewRecord(false);
    }

    const t = isAdventure ? stageTime(stg) : 90;
    timeRef.current = t;

    playerAnim.current.stopAnimation();
    playerAnim.current.setValue({
      x: WALL + (CELL - EMOJI_SZ) / 2,
      y: WALL + (CELL - EMOJI_SZ) / 2,
    });

    setStage(stg);
    setLives(curLives);
    setTimeLeft(t);
    setWon(false);
    setGameOver(false);
    setMazeVer((v) => v + 1);

    startTimer();
  }

  useEffect(() => {
    initLevel(initStage, initLives);
    return () => {
      clearInterval(timerIdRef.current);
      clearInterval(dpadIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Next Time Attack maze — chains seamlessly, timer keeps running + 15 s ──
  function nextTAMaze(count: number) {
    // Add bonus time
    const newTime = timeRef.current + 15;
    timeRef.current = newTime;
    setTimeLeft(newTime);

    mazesCompletedRef.current = count;
    setMazesCompleted(count);

    // Progressive difficulty: reuse colsForStage with count as the "stage"
    layoutRef.current = computeLayout(count, availH);
    const { COLS, CELL, ROWS, EMOJI_SZ } = layoutRef.current;

    mazeRef.current   = generateQualityMaze(ROWS, COLS, undefined, mazeAttempts(COLS));
    playerRef.current = { r: 0, c: 0 };
    wonRef.current    = false;

    playerAnim.current.stopAnimation();
    playerAnim.current.setValue({
      x: WALL + (CELL - EMOJI_SZ) / 2,
      y: WALL + (CELL - EMOJI_SZ) / 2,
    });

    setWon(false);
    setMazeVer((v) => v + 1);

    flashBonus();
    startTimer();
  }

  // ── Move ─────────────────────────────────────────────────────────────────────
  function move(dr: number, dc: number) {
    if (wonRef.current || deadRef.current || pausedRef.current) return;
    const { r, c } = playerRef.current;
    const cell = mazeRef.current[r]?.[c];
    if (!cell) return;

    const blocked =
      (dr === -1 && cell.top)    || (dr === 1 && cell.bottom) ||
      (dc === -1 && cell.left)   || (dc === 1 && cell.right);

    if (!blocked) {
      const nr = r + dr, nc = c + dc;
      const { ROWS, COLS, CELL, EMOJI_SZ } = layoutRef.current;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        playerRef.current = { r: nr, c: nc };

        Animated.timing(playerAnim.current, {
          toValue: {
            x: WALL + nc * CELL + (CELL - EMOJI_SZ) / 2,
            y: WALL + nr * CELL + (CELL - EMOJI_SZ) / 2,
          },
          duration: 100,
          useNativeDriver: true,
        }).start();

        // Win check
        if (nr === ROWS - 1 && nc === COLS - 1) {
          wonRef.current = true;
          clearInterval(timerIdRef.current);

          if (isAdventure) {
            const total  = stageTime(stageRef.current);
            const used   = total - timeRef.current;
            const earned = calcStars(used, total);
            setClearSecs(used);
            playClearAnim(earned);
            setWon(true);
          } else {
            // Time Attack: chain to next maze seamlessly — no win overlay
            nextTAMaze(mazesCompletedRef.current + 1);
          }
        }
      }
    }
  }

  // ── D-pad hold ───────────────────────────────────────────────────────────────
  function startMove(dr: number, dc: number) {
    clearInterval(dpadIdRef.current);
    move(dr, dc);
    dpadIdRef.current = setInterval(() => move(dr, dc), 150);
  }
  function stopMove() { clearInterval(dpadIdRef.current); }

  // ── Pause / Resume ───────────────────────────────────────────────────────────
  function pauseGame() {
    if (wonRef.current || deadRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    clearInterval(dpadIdRef.current);
  }
  function resumeGame() {
    pausedRef.current = false;
    setPaused(false);
  }

  // ── Drag to move ─────────────────────────────────────────────────────────────
  // dragBase tracks the gesture position at the last cell-move so we measure
  // incremental distance from that point, not from the gesture origin.
  const dragBaseRef = useRef({ x: 0, y: 0 });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: () => {
        dragBaseRef.current = { x: 0, y: 0 };
      },

      onPanResponderMove: (_, gs) => {
        const relX = gs.dx - dragBaseRef.current.x;
        const relY = gs.dy - dragBaseRef.current.y;
        const thr  = layoutRef.current.CELL * 0.55; // ~55 % of a cell triggers a step

        if (Math.abs(relX) >= Math.abs(relY)) {
          // horizontal dominant
          if (relX >= thr) {
            move(0, 1);
            dragBaseRef.current = { x: gs.dx, y: gs.dy };
          } else if (relX <= -thr) {
            move(0, -1);
            dragBaseRef.current = { x: gs.dx, y: gs.dy };
          }
        } else {
          // vertical dominant
          if (relY >= thr) {
            move(1, 0);
            dragBaseRef.current = { x: gs.dx, y: gs.dy };
          } else if (relY <= -thr) {
            move(-1, 0);
            dragBaseRef.current = { x: gs.dx, y: gs.dy };
          }
        }
      },

      onPanResponderRelease: () => {
        dragBaseRef.current = { x: 0, y: 0 };
      },
    })
  ).current;

  // ── Wall segments (only recomputed on new maze) ───────────────────────────
  const wallSegs = useMemo(
    () => buildWalls(mazeRef.current, layoutRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mazeVer]
  );

  // ── Derived ──────────────────────────────────────────────────────────────────
  const { COLS, CELL, ROWS, MAZE_W, MAZE_H, EMOJI_SZ } = layoutRef.current;
  const goalX   = WALL + (COLS-1) * CELL + (CELL - EMOJI_SZ) / 2;
  const goalY   = WALL + (ROWS-1) * CELL + (CELL - EMOJI_SZ) / 2;
  const hearts  = '❤️ '.repeat(lives).trim() || '💔';
  const curLive = liveStars(timeLeft, isAdventure ? stageTime(stage) : 90);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── HUD ── */}
      <View style={styles.hud}>
        {isAdventure ? (
          <>
            {/* Stage + world */}
            <View style={styles.hudBlock}>
              <Text style={styles.hudSmall}>STAGE</Text>
              <Text style={styles.hudBig}>{stage}</Text>
              <Text style={styles.hudTiny} numberOfLines={1}>
                {worldEmoji(stage)} {worldName(stage)}
              </Text>
            </View>

            {/* Timer + live stars */}
            <View style={styles.hudBlock}>
              <Text style={styles.hudSmall}>TIME</Text>
              <Text style={[styles.hudBig, timeLeft <= 10 && styles.timeWarn]}>
                {fmtTime(timeLeft)}
              </Text>
              <Text style={styles.hudLiveStars}>
                {'⭐'.repeat(curLive)}{'☆'.repeat(3 - curLive)}
              </Text>
            </View>

            {/* Lives */}
            <View style={styles.hudBlock}>
              <Text style={styles.hudSmall}>LIVES</Text>
              <Text style={styles.hudHearts}>{hearts}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.hudBlock}>
              <Text style={styles.hudSmall}>⚡ MAZES</Text>
              <Text style={[styles.hudBig, { color: '#fb923c' }]}>{mazesCompleted}</Text>
              <Text style={styles.hudTiny}>solved</Text>
            </View>
            <View style={styles.hudBlock}>
              <Text style={styles.hudSmall}>TIME LEFT</Text>
              <Text style={[styles.hudBig, { color: '#fb923c' }, timeLeft <= 10 && styles.timeWarn]}>
                {fmtTime(timeLeft)}
              </Text>
              <Text style={styles.hudTiny}>{timeLeft <= 10 ? '⚠️ hurry!' : '+15s per maze'}</Text>
            </View>
            <View style={styles.hudBlock}>
              <Text style={styles.hudSmall}>🏆 BEST</Text>
              <Text style={[styles.hudBig, { color: C_GOLD }]}>{taBest > 0 ? String(taBest) : '--'}</Text>
              <Text style={styles.hudTiny}>mazes</Text>
            </View>
          </>
        )}

        {/* ── Pause button — lives-side, inside HUD ── */}
        {!won && !gameOver && (
          <TouchableOpacity
            style={styles.pauseBtn}
            onPress={paused ? resumeGame : pauseGame}
            activeOpacity={0.7}
          >
            <Text style={styles.pauseBtnTxt}>{paused ? '▶' : '⏸'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Maze ── */}
      <View
        style={[styles.mazeFrame, { width: MAZE_W + 8, height: MAZE_H + 8 }]}
        {...pan.panHandlers}
        key={`maze-${COLS}`}
      >
        <View style={[styles.mazeInner, { width: MAZE_W, height: MAZE_H }]}>
          {wallSegs.map((s) => (
            <View
              key={s.key}
              style={{
                position: 'absolute',
                top: s.t, left: s.l,
                width: s.w, height: s.h,
                backgroundColor: C_WALL,
              }}
            />
          ))}

          {/* Castle goal (pulsing) */}
          <Animated.Text
            style={[
              styles.goalEmoji,
              { left: goalX, top: goalY, fontSize: EMOJI_SZ,
                transform: [{ scale: goalScale.current }] },
            ]}
          >
            🏰
          </Animated.Text>

          {/* Fairy player */}
          <Animated.Text
            style={[
              styles.playerEmoji,
              { fontSize: EMOJI_SZ,
                transform: playerAnim.current.getTranslateTransform() },
            ]}
          >
            🧚‍♀️
          </Animated.Text>
        </View>
      </View>

      {/* ── D-Pad ── */}
      <View style={styles.dpad}>
        <DBtn label="▲" onPressIn={() => startMove(-1, 0)} onPressOut={stopMove} />
        <View style={styles.dRow}>
          <DBtn label="◀" onPressIn={() => startMove(0, -1)} onPressOut={stopMove} />
          <View style={styles.dCenter}>
            <Text style={styles.dCenterTxt}>🧭</Text>
          </View>
          <DBtn label="▶" onPressIn={() => startMove(0, 1)} onPressOut={stopMove} />
        </View>
        <DBtn label="▼" onPressIn={() => startMove(1, 0)} onPressOut={stopMove} />
      </View>

      {/* ════════ ADVENTURE STAGE CLEAR ════════ */}
      {won && isAdventure && (
        <View style={styles.overlay}>
          {/* Confetti row */}
          <Animated.Text
            style={[
              styles.confetti,
              { opacity: confettiOp.current,
                transform: [{ translateY: confettiY.current }] },
            ]}
          >
            🎉 ✨ 🎊 🌟 🎉
          </Animated.Text>

          {/* Card */}
          <Animated.View
            style={[styles.clearCard, { transform: [{ translateY: clearSlide.current }] }]}
          >
            <Text style={styles.clearTitle}>Stage Clear! 🏆</Text>
            <Text style={styles.clearWorld}>
              {worldEmoji(stage)}  {worldName(stage)}
            </Text>

            {/* Stars */}
            <View style={styles.starsRow}>
              {([s1Anim, s2Anim, s3Anim] as { current: Animated.Value }[]).map((a, i) => (
                <Animated.Text
                  key={i}
                  style={[styles.starIcon, {
                    transform: [{ scale: a.current }],
                    opacity: a.current,
                  }]}
                >
                  ⭐
                </Animated.Text>
              ))}
            </View>

            <Text style={styles.clearTime}>
              Clear Time: {fmtTime(clearSecs)}
            </Text>

            <View style={styles.clearBtns}>
              <TouchableOpacity
                style={[styles.cBtn, styles.cBtnMenu]}
                onPress={() => router.replace('/home')}
              >
                <Text style={styles.cBtnTxt}>🏠{'\n'}MENU</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cBtn, styles.cBtnRetry]}
                onPress={() => initLevel(stage, lives)}
              >
                <Text style={styles.cBtnTxt}>🔄{'\n'}RETRY</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cBtn, styles.cBtnNext]}
                onPress={() =>
                  initLevel(stage + 1, lives)
                }
              >
                <Text style={styles.cBtnTxt}>NEXT{'\n'}▶</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      {/* ════════ TIME ATTACK BONUS FLASH (+15s) ════════ */}
      {!isAdventure && (
        <Animated.Text
          style={[
            styles.taBonus,
            { opacity: bonusOp.current, transform: [{ translateY: bonusY.current }] },
          ]}
        >
          +15s ⚡
        </Animated.Text>
      )}

      {/* ════════ PAUSE MENU ════════ */}
      {paused && (
        <View style={styles.overlay}>
          <Text style={styles.pauseTitle}>⏸  PAUSED</Text>

          <TouchableOpacity
            style={[styles.pauseMenuBtn, { backgroundColor: '#166534' }]}
            onPress={resumeGame}
          >
            <Text style={styles.pauseMenuTxt}>▶  Resume</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pauseMenuBtn, { backgroundColor: '#1d4ed8' }]}
            onPress={() => {
              pausedRef.current = false;
              setPaused(false);
              initLevel(stageRef.current, livesRef.current);
            }}
          >
            <Text style={styles.pauseMenuTxt}>🔄  Restart Stage</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pauseMenuBtn, { backgroundColor: '#374151' }]}
            onPress={() => router.replace('/home')}
          >
            <Text style={styles.pauseMenuTxt}>🏠  Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ════════ ADVENTURE GAME OVER ════════ */}
      {gameOver && isAdventure && (
        <View style={styles.overlay}>
          <Text style={styles.goEmoji}>💫</Text>
          <Text style={styles.goTitle}>Oh No!</Text>
          <Text style={styles.goSub}>
            {`You reached stage ${stage}\n${worldEmoji(stage)} ${worldName(stage)}`}
          </Text>
          <TouchableOpacity
            style={[styles.cBtn, styles.cBtnNext, { paddingHorizontal: 40, marginBottom: 14 }]}
            onPress={() => initLevel(stage, 3)}
          >
            <Text style={[styles.cBtnTxt, { fontSize: 17 }]}>🎮  Try Again!</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/home')}>
            <Text style={styles.goHome}>🏠  Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ════════ TIME ATTACK GAME OVER ════════ */}
      {gameOver && !isAdventure && (
        <View style={styles.overlay}>
          <Text style={styles.taGoLightning}>⚡</Text>
          <Text style={styles.taGoTimeUp}>Time's Up!</Text>
          {isNewRecord && (
            <View style={styles.taRecordBadge}>
              <Text style={styles.taRecordTxt}>🏆  NEW RECORD!</Text>
            </View>
          )}
          <Text style={styles.taGoNum}>{mazesCompleted}</Text>
          <Text style={styles.taGoLabel}>MAZES SOLVED</Text>
          <Text style={styles.taGoBest}>
            {isNewRecord
              ? 'Amazing! Personal best!'
              : taBest > 0
                ? `Personal best: ${taBest} maze${taBest !== 1 ? 's' : ''}`
                : 'Complete more mazes next time!'}
          </Text>
          <TouchableOpacity
            style={[styles.cBtn, styles.cBtnTA, { paddingHorizontal: 36, marginTop: 28, marginBottom: 14 }]}
            onPress={() => initLevel(1, 1)}
          >
            <Text style={[styles.cBtnTxt, { fontSize: 17 }]}>⚡  Play Again!</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/home')}>
            <Text style={styles.goHome}>🏠  Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── D-Pad button ─────────────────────────────────────────────────────────────
function DBtn({
  label, onPressIn, onPressOut,
}: { label: string; onPressIn: () => void; onPressOut: () => void }) {
  return (
    <TouchableOpacity
      style={styles.dBtn}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={0.62}
    >
      <Text style={styles.dBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C_SCREEN, alignItems: 'center' },

  // ── HUD ──────────────────────────────────────────────────────────────────────
  hud: {
    width: '100%', height: 92,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: C_HUD,
    borderBottomWidth: 2,
    borderBottomColor: C_GOLD,
    paddingLeft: 10,
    paddingRight: 62,  // reserve space for the 42px pause button + 10px margin
    shadowColor: C_GOLD,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  hudBlock:     { alignItems: 'center', flex: 1 },
  hudSmall:     { color: C_PURPLE, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  hudBig:       { color: '#fff', fontSize: 22, fontWeight: 'bold', lineHeight: 26 },
  hudTiny:      { color: C_GOLD, fontSize: 9, fontWeight: '600' },
  hudLiveStars: { fontSize: 14, lineHeight: 18 },
  hudHearts:    { fontSize: 16, lineHeight: 22 },
  timeWarn:     { color: '#f87171' },

  // ── Maze ─────────────────────────────────────────────────────────────────────
  mazeFrame: {
    marginTop: 8,
    padding: 4,
    borderRadius: 10,
    backgroundColor: C_GOLD,
    shadowColor: C_GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 12,
  },
  mazeInner:    { overflow: 'hidden', borderRadius: 6, backgroundColor: C_FLOOR },
  goalEmoji:    { position: 'absolute', textAlign: 'center' },
  playerEmoji:  { position: 'absolute', top: 0, left: 0, textAlign: 'center' },

  // ── D-Pad ─────────────────────────────────────────────────────────────────────
  dpad:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dCenter:   {
    width: 52, height: 52,
    backgroundColor: '#120228',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dCenterTxt: { fontSize: 26 },
  dBtn: {
    width: 52, height: 52,
    backgroundColor: '#1e0a4a',
    borderWidth: 2, borderColor: C_PURPLE,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C_PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 8,
    elevation: 6,
  },
  dBtnTxt: { color: '#e9d5ff', fontSize: 22 },

  // ── Overlays ─────────────────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,1,15,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stage Clear
  confetti: { fontSize: 28, marginBottom: 12 },
  clearCard: {
    backgroundColor: '#1a0540',
    borderWidth: 2.5,
    borderColor: C_GOLD,
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    width: '88%',
    shadowColor: C_GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
  },
  clearTitle: {
    color: C_GOLD,
    fontSize: 34,
    fontWeight: 'bold',
    textShadowColor: C_GOLD,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
    marginBottom: 4,
  },
  clearWorld: { color: C_PURPLE, fontSize: 16, marginBottom: 20 },
  starsRow:   { flexDirection: 'row', gap: 12, marginBottom: 16 },
  starIcon:   { fontSize: 44 },
  clearTime:  { color: '#ccc', fontSize: 16, marginBottom: 6 },
  bonusLine:  { color: '#4ade80', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  clearBtns:  { flexDirection: 'row', gap: 12, marginTop: 18 },
  cBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    minWidth: 76,
    elevation: 6,
  },
  cBtnMenu:  { backgroundColor: '#374151' },
  cBtnRetry: { backgroundColor: '#1d4ed8' },
  cBtnNext:  {
    backgroundColor: '#166534',
    shadowColor: '#4ade80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  cBtnTxt: { color: '#fff', fontSize: 14, fontWeight: 'bold', textAlign: 'center', lineHeight: 20 },

  // Time Attack Bonus Flash
  taBonus: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    color: '#fb923c',
    fontSize: 36,
    fontWeight: 'bold',
    textShadowColor: '#fb923c',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    zIndex: 99,
  },

  // Time Attack Game Over
  cBtnTA: {
    backgroundColor: '#7c2d00',
    borderWidth: 2,
    borderColor: '#fb923c',
    shadowColor: '#fb923c',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
  },
  taGoLightning: { fontSize: 76, marginBottom: 2 },
  taGoTimeUp: {
    color: '#fb923c',
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 12,
    textShadowColor: '#fb923c',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  taRecordBadge: {
    backgroundColor: '#7c2d00',
    borderWidth: 2,
    borderColor: '#fb923c',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 12,
    shadowColor: '#fb923c',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  taRecordTxt: { color: '#fb923c', fontSize: 20, fontWeight: 'bold', letterSpacing: 1 },
  taGoNum: {
    color: C_GOLD,
    fontSize: 88,
    fontWeight: 'bold',
    lineHeight: 94,
    textShadowColor: C_GOLD,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  taGoLabel: { color: '#fb923c', fontSize: 16, fontWeight: 'bold', letterSpacing: 3, marginBottom: 8 },
  taGoBest:  { color: '#aaa', fontSize: 15, textAlign: 'center', marginBottom: 4 },

  // Pause button — absolutely positioned inside the HUD view
  pauseBtn: {
    position: 'absolute',
    right: 10,
    top: (92 - 42) / 2,   // vertically centred in 92 px HUD
    backgroundColor: '#1e0a4a',
    borderWidth: 2,
    borderColor: C_PURPLE,
    borderRadius: 10,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C_PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  pauseBtnTxt: { color: '#e9d5ff', fontSize: 18 },

  // Pause menu
  pauseTitle: {
    color: C_GOLD,
    fontSize: 34,
    fontWeight: 'bold',
    marginBottom: 32,
    textShadowColor: C_GOLD,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  pauseMenuBtn: {
    width: '72%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 14,
    elevation: 6,
  },
  pauseMenuTxt: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // Game Over
  goEmoji: { fontSize: 80, marginBottom: 6 },
  goTitle: {
    color: '#f87171', fontSize: 52, fontWeight: 'bold', marginBottom: 6,
    textShadowColor: '#f87171', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18,
  },
  goSub:  { color: '#aaa', fontSize: 17, textAlign: 'center', lineHeight: 26, marginBottom: 36 },
  goHome: { color: '#555', fontSize: 18 },
});
