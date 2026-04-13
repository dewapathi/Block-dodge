/**
 * Enchanted Maze — Game Screen
 *
 * Mode "adventure" : seeded stages, 3 lives, ⭐ star rating, stage-clear overlay
 * Mode "time"      : random maze, 90 s countdown, beat your best score
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

import { generateMaze, MazeGrid } from '@/utils/mazeGenerator';

// ─── Layout ───────────────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const COLS     = 9;
const WALL     = 3;
const CELL     = Math.floor((SCREEN_W - WALL * 2) / COLS);
const MAZE_W   = CELL * COLS + WALL * 2;
const EMOJI_SZ = Math.floor(CELL * 0.68);

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
const stageTime = (s: number) => Math.max(25, 90 - (s - 1) * 4);
const stageSeed = (s: number, rows: number) => s * 997 + rows * 31 + COLS;

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
function buildWalls(maze: MazeGrid, rows: number) {
  type Seg = { key: string; t: number; l: number; w: number; h: number };
  const segs: Seg[] = [];
  if (!maze || maze.length === 0) return segs;

  const mh = CELL * rows;
  segs.push({ key: 'ot', t: 0,  l: 0,          w: MAZE_W,         h: WALL });
  segs.push({ key: 'ol', t: 0,  l: 0,           w: WALL,           h: mh + WALL });
  segs.push({ key: 'or', t: 0,  l: MAZE_W-WALL, w: WALL,           h: mh + WALL });
  segs.push({ key: 'ob', t: mh, l: 0,           w: MAZE_W - CELL,  h: WALL }); // gap = exit

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = maze[r][c];
      const x = WALL + c * CELL;
      const y = WALL + r * CELL;

      if (cell.right && c < COLS - 1)
        segs.push({ key: `rw${r}_${c}`, t: y-WALL, l: x+CELL-WALL, w: WALL, h: CELL+WALL });

      if (cell.bottom && !(r === rows-1 && c === COLS-1))
        segs.push({ key: `bw${r}_${c}`, t: y+CELL-WALL, l: x-WALL, w: CELL+WALL, h: WALL });
    }
  }
  return segs;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MazeGame() {
  const insets = useSafeAreaInsets();
  const { mode, stage: stageParam } = useLocalSearchParams<{ mode?: string; stage?: string }>();

  const isAdventure  = mode !== 'time';
  const initStage    = parseInt(stageParam || '1', 10);

  // ── Computed layout ─────────────────────────────────────────────────────────
  const HUD_H  = 92;
  const CTRL_H = 205;
  const availH = SCREEN_H - HUD_H - CTRL_H - insets.top - insets.bottom - 14;
  const ROWS   = Math.max(8, Math.floor(availH / CELL));
  const MAZE_H = CELL * ROWS + WALL * 2;

  // ── Refs (no stale-closure issues) ──────────────────────────────────────────
  const mazeRef    = useRef<MazeGrid>([]);
  const playerRef  = useRef({ r: 0, c: 0 });
  const wonRef     = useRef(false);
  const deadRef    = useRef(false);
  const stageRef   = useRef(initStage);
  const livesRef   = useRef(isAdventure ? 3 : 1);
  const timeRef    = useRef(isAdventure ? stageTime(initStage) : 90);
  const timerIdRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const dpadIdRef  = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pausedRef  = useRef(false);

  const playerAnim = useRef(new Animated.ValueXY({
    x: WALL + (CELL - EMOJI_SZ) / 2,
    y: WALL + (CELL - EMOJI_SZ) / 2,
  }));
  const goalScale  = useRef(new Animated.Value(1));

  // Stage-clear animation refs
  const clearSlide = useRef(new Animated.Value(-350));
  const s1Anim     = useRef(new Animated.Value(0));
  const s2Anim     = useRef(new Animated.Value(0));
  const s3Anim     = useRef(new Animated.Value(0));
  const confettiY  = useRef(new Animated.Value(-80));
  const confettiOp = useRef(new Animated.Value(0));

  // ── State ───────────────────────────────────────────────────────────────────
  const [stage,     setStage]     = useState(initStage);
  const [lives,     setLives]     = useState(isAdventure ? 3 : 1);
  const [timeLeft,  setTimeLeft]  = useState(isAdventure ? stageTime(initStage) : 90);
  const [won,       setWon]       = useState(false);
  const [gameOver,  setGameOver]  = useState(false);
  const [paused,    setPaused]    = useState(false);
  const [starsWon,  setStarsWon]  = useState<1|2|3>(1);
  const [clearSecs, setClearSecs] = useState(0);
  const [mazeVer,   setMazeVer]   = useState(0);
  const [bestScore, setBestScore] = useState(0); // time attack

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

  // ── Level init ────────────────────────────────────────────────────────────
  function initLevel(stg: number, curLives: number) {
    clearInterval(timerIdRef.current);

    const seed = isAdventure ? stageSeed(stg, ROWS) : undefined;
    mazeRef.current   = generateMaze(ROWS, COLS, seed);
    playerRef.current = { r: 0, c: 0 };
    wonRef.current    = false;
    deadRef.current   = false;
    stageRef.current  = stg;
    livesRef.current  = curLives;

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
    setStarsWon(1);
    setMazeVer((v) => v + 1);

    // Start timer
    clearInterval(timerIdRef.current);
    timerIdRef.current = setInterval(() => {
      if (wonRef.current || deadRef.current || pausedRef.current) return;
      timeRef.current -= 1;
      setTimeLeft(timeRef.current);

      if (timeRef.current <= 0) {
        clearInterval(timerIdRef.current);
        const nl = livesRef.current - 1;
        livesRef.current = nl;
        setLives(nl);
        if (nl <= 0) {
          deadRef.current = true;
          setGameOver(true);
        } else {
          initLevel(stageRef.current, nl);
        }
      }
    }, 1000);
  }

  useEffect(() => {
    initLevel(initStage, isAdventure ? 3 : 1);
    return () => {
      clearInterval(timerIdRef.current);
      clearInterval(dpadIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            setStarsWon(earned);
            playClearAnim(earned);
          } else {
            if (timeRef.current > bestScore) setBestScore(timeRef.current);
          }
          setWon(true);
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
        const thr  = CELL * 0.55; // ~55 % of a cell triggers a step

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
    () => buildWalls(mazeRef.current, ROWS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mazeVer]
  );

  // ── Derived ──────────────────────────────────────────────────────────────────
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
              <Text style={styles.hudSmall}>⚡ TIME ATTACK</Text>
              <Text style={[styles.hudBig, { color: '#fb923c' }, timeLeft <= 10 && styles.timeWarn]}>
                {fmtTime(timeLeft)}
              </Text>
            </View>
            <View style={styles.hudBlock}>
              <Text style={styles.hudSmall}>🏆 BEST</Text>
              <Text style={[styles.hudBig, { color: C_GOLD }]}>
                {bestScore > 0 ? fmtTime(bestScore) : '--:--'}
              </Text>
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
            {starsWon === 3 && (
              <Text style={styles.bonusLine}>🎁 Bonus life earned!</Text>
            )}

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
                  initLevel(stage + 1, Math.min(lives + (starsWon === 3 ? 1 : 0), 5))
                }
              >
                <Text style={styles.cBtnTxt}>NEXT{'\n'}▶</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      {/* ════════ TIME ATTACK WIN ════════ */}
      {won && !isAdventure && (
        <View style={styles.overlay}>
          <Text style={styles.taEmoji}>⚡</Text>
          <Text style={styles.taTitle}>Maze Solved!</Text>
          <Text style={styles.taSub}>Time remaining</Text>
          <Text style={styles.taScore}>{fmtTime(timeLeft)}</Text>
          {timeLeft >= bestScore && bestScore > 0 && (
            <Text style={styles.taNewBest}>🏆 New Best Score!</Text>
          )}
          <View style={styles.taBtns}>
            <TouchableOpacity style={[styles.cBtn, styles.cBtnMenu]} onPress={() => router.replace('/home')}>
              <Text style={styles.cBtnTxt}>🏠{'\n'}MENU</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cBtn, styles.cBtnNext]} onPress={() => initLevel(1, 1)}>
              <Text style={styles.cBtnTxt}>▶{'\n'}AGAIN</Text>
            </TouchableOpacity>
          </View>
        </View>
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

      {/* ════════ GAME OVER ════════ */}
      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.goEmoji}>💫</Text>
          <Text style={styles.goTitle}>Oh No!</Text>
          <Text style={styles.goSub}>
            {isAdventure
              ? `You reached stage ${stage}\n${worldEmoji(stage)} ${worldName(stage)}`
              : 'Time ran out!'}
          </Text>
          <TouchableOpacity
            style={[styles.cBtn, styles.cBtnNext, { paddingHorizontal: 40, marginBottom: 14 }]}
            onPress={() => initLevel(isAdventure ? stage : 1, isAdventure ? 3 : 1)}
          >
            <Text style={[styles.cBtnTxt, { fontSize: 17 }]}>🎮  Try Again!</Text>
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

  // Time Attack Win
  taEmoji:   { fontSize: 70, marginBottom: 6 },
  taTitle:   { color: '#fb923c', fontSize: 44, fontWeight: 'bold', marginBottom: 4 },
  taSub:     { color: '#aaa', fontSize: 16 },
  taScore:   { color: C_GOLD, fontSize: 48, fontWeight: 'bold', marginBottom: 8 },
  taNewBest: { color: '#4ade80', fontSize: 18, fontWeight: 'bold', marginBottom: 28 },
  taBtns:    { flexDirection: 'row', gap: 16 },

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
