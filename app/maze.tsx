/**
 * Enchanted Maze 🧚‍♀️
 * Guide the fairy through the magical hedge maze to reach the castle!
 * Controls: D-pad buttons (hold for continuous movement) or swipe on the maze.
 */

import { router } from 'expo-router';
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

// ─── Layout ──────────────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const COLS      = 9;
const WALL      = 3;
const CELL      = Math.floor((SCREEN_W - WALL * 2) / COLS);
const MAZE_W    = CELL * COLS + WALL * 2;
const EMOJI_SZ  = Math.floor(CELL * 0.7); // emoji font size

// ─── Palette ─────────────────────────────────────────────────────────────────
const C_SCREEN  = '#0f0a2e';  // deep night-sky purple
const C_FLOOR   = '#fdf4ff';  // soft magical cream
const C_WALL    = '#6B21A8';  // vivid magic-purple hedge
const C_HUD_BG  = '#1e0a4a';  // dark purple HUD
const C_GOLD    = '#FFD700';
const C_PURPLE  = '#a78bfa';

// ─── Level flavour ───────────────────────────────────────────────────────────
const WORLDS = [
  'Enchanted Forest',   'Fairy Garden',     "Dragon's Cave",
  'Crystal Kingdom',    "Wizard's Tower",   'Mermaid Cove',
  "Giant's Castle",     'Phoenix Valley',   'Unicorn Meadow',
  'Rainbow Bridge',
];
const worldName = (lvl: number) => WORLDS[(lvl - 1) % WORLDS.length];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const fmtTime = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const startTime = (lvl: number) => Math.max(25, 90 - (lvl - 1) * 5);

// ─── Wall-segment builder ────────────────────────────────────────────────────
function buildWalls(maze: MazeGrid, rows: number) {
  type Seg = { key: string; t: number; l: number; w: number; h: number };
  const segs: Seg[] = [];
  if (!maze || maze.length === 0) return segs;

  const mh = CELL * rows;

  // Outer border (gap at exit = bottom-right cell)
  segs.push({ key: 'ot', t: 0,      l: 0,          w: MAZE_W,              h: WALL });
  segs.push({ key: 'ol', t: 0,      l: 0,           w: WALL,               h: mh + WALL });
  segs.push({ key: 'or', t: 0,      l: MAZE_W-WALL, w: WALL,               h: mh + WALL });
  segs.push({ key: 'ob', t: mh,     l: 0,           w: MAZE_W - CELL,      h: WALL }); // gap at exit

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = maze[r][c];
      const x = WALL + c * CELL;
      const y = WALL + r * CELL;

      if (cell.right && c < COLS - 1) {
        segs.push({ key: `rw${r}_${c}`, t: y - WALL, l: x + CELL - WALL, w: WALL, h: CELL + WALL });
      }
      if (cell.bottom && !(r === rows - 1 && c === COLS - 1)) {
        segs.push({ key: `bw${r}_${c}`, t: y + CELL - WALL, l: x - WALL, w: CELL + WALL, h: WALL });
      }
    }
  }
  return segs;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MazeGame() {
  const insets = useSafeAreaInsets();

  const HUD_H   = 86;
  const CTRL_H  = 200;
  const availH  = SCREEN_H - HUD_H - CTRL_H - insets.top - insets.bottom - 12;
  const ROWS    = Math.max(8, Math.floor(availH / CELL));
  const MAZE_H  = CELL * ROWS + WALL * 2;

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const mazeRef     = useRef<MazeGrid>([]);
  const playerRef   = useRef({ r: 0, c: 0 });
  const wonRef      = useRef(false);
  const deadRef     = useRef(false);
  const levelRef    = useRef(1);
  const livesRef    = useRef(3);
  const timeRef     = useRef(startTime(1));
  const timerIdRef  = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const dpadIdRef   = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const playerAnim  = useRef(
    new Animated.ValueXY({
      x: WALL + (CELL - EMOJI_SZ) / 2,
      y: WALL + (CELL - EMOJI_SZ) / 2,
    })
  );
  const goalScale   = useRef(new Animated.Value(1));

  // ── State ─────────────────────────────────────────────────────────────────────
  const [level,      setLevel]      = useState(1);
  const [lives,      setLives]      = useState(3);
  const [timeLeft,   setTimeLeft]   = useState(startTime(1));
  const [won,        setWon]        = useState(false);
  const [gameOver,   setGameOver]   = useState(false);
  const [mazeVer,    setMazeVer]    = useState(0);

  // ── Pulsing castle animation ──────────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(goalScale.current, { toValue: 1.25, duration: 700, useNativeDriver: true }),
        Animated.timing(goalScale.current, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Level init ───────────────────────────────────────────────────────────────
  function initLevel(lvl: number, currentLives: number) {
    clearInterval(timerIdRef.current);
    mazeRef.current   = generateMaze(ROWS, COLS);
    playerRef.current = { r: 0, c: 0 };
    wonRef.current    = false;
    deadRef.current   = false;
    levelRef.current  = lvl;
    livesRef.current  = currentLives;
    const t = startTime(lvl);
    timeRef.current   = t;

    playerAnim.current.stopAnimation();
    playerAnim.current.setValue({
      x: WALL + (CELL - EMOJI_SZ) / 2,
      y: WALL + (CELL - EMOJI_SZ) / 2,
    });

    setLevel(lvl);
    setLives(currentLives);
    setTimeLeft(t);
    setWon(false);
    setGameOver(false);
    setMazeVer((v) => v + 1);

    startTimer();
  }

  function startTimer() {
    clearInterval(timerIdRef.current);
    timerIdRef.current = setInterval(() => {
      if (wonRef.current || deadRef.current) return;
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
          initLevel(levelRef.current, nl);
        }
      }
    }, 1000);
  }

  useEffect(() => {
    initLevel(1, 3);
    return () => {
      clearInterval(timerIdRef.current);
      clearInterval(dpadIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Move ──────────────────────────────────────────────────────────────────────
  function move(dr: number, dc: number) {
    if (wonRef.current || deadRef.current) return;
    const { r, c } = playerRef.current;
    const cell = mazeRef.current[r]?.[c];
    if (!cell) return;

    const blocked =
      (dr === -1 && cell.top)    ||
      (dr === 1  && cell.bottom) ||
      (dc === -1 && cell.left)   ||
      (dc === 1  && cell.right);

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

        if (nr === ROWS - 1 && nc === COLS - 1) {
          wonRef.current = true;
          clearInterval(timerIdRef.current);
          setWon(true);
        }
      }
    }
  }

  // ── D-pad hold ────────────────────────────────────────────────────────────────
  function startMove(dr: number, dc: number) {
    clearInterval(dpadIdRef.current);
    move(dr, dc);
    dpadIdRef.current = setInterval(() => move(dr, dc), 150);
  }
  function stopMove() { clearInterval(dpadIdRef.current); }

  // ── Swipe ─────────────────────────────────────────────────────────────────────
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderRelease: (_, gs) => {
        const { dx, dy } = gs;
        if (Math.abs(dx) > Math.abs(dy)) {
          dx > 15 ? move(0, 1) : move(0, -1);
        } else {
          dy > 15 ? move(1, 0) : move(-1, 0);
        }
      },
    })
  ).current;

  // ── Wall segments memo ────────────────────────────────────────────────────────
  const wallSegs = useMemo(
    () => buildWalls(mazeRef.current, ROWS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mazeVer]
  );

  // Goal position
  const goalX = WALL + (COLS - 1) * CELL + (CELL - EMOJI_SZ) / 2;
  const goalY = WALL + (ROWS - 1) * CELL + (CELL - EMOJI_SZ) / 2;

  // ── Heart lives ───────────────────────────────────────────────────────────────
  const heartsDisplay = '❤️ '.repeat(lives).trim();

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── HUD ── */}
      <View style={styles.hud}>
        <View style={styles.hudItem}>
          <Text style={styles.hudLabel}>LEVEL</Text>
          <Text style={styles.hudBig}>{level}</Text>
          <Text style={styles.hudWorld} numberOfLines={1}>{worldName(level)}</Text>
        </View>
        <View style={styles.hudItem}>
          <Text style={styles.hudLabel}>TIME</Text>
          <Text style={[styles.hudBig, timeLeft <= 10 && styles.timeWarn]}>
            {fmtTime(timeLeft)}
          </Text>
        </View>
        <View style={styles.hudItem}>
          <Text style={styles.hudLabel}>LIVES</Text>
          <Text style={styles.hudHearts}>{heartsDisplay || '💔'}</Text>
        </View>
      </View>

      {/* ── Maze ── */}
      <View
        style={[styles.mazeFrame, { width: MAZE_W + 6, height: MAZE_H + 6 }]}
        {...pan.panHandlers}
      >
        {/* Golden glowing border */}
        <View style={[styles.mazeInner, { width: MAZE_W, height: MAZE_H, backgroundColor: C_FLOOR }]}>
          {/* Hedge walls */}
          {wallSegs.map((s) => (
            <View
              key={s.key}
              style={{
                position: 'absolute',
                top: s.t, left: s.l,
                width: s.w, height: s.h,
                backgroundColor: C_WALL,
                borderRadius: 1,
              }}
            />
          ))}

          {/* ── Castle goal (pulsing) ── */}
          <Animated.Text
            style={[
              styles.goalEmoji,
              {
                left: goalX,
                top: goalY,
                fontSize: EMOJI_SZ,
                transform: [{ scale: goalScale.current }],
              },
            ]}
          >
            🏰
          </Animated.Text>

          {/* ── Fairy player ── */}
          <Animated.Text
            style={[
              styles.playerEmoji,
              {
                fontSize: EMOJI_SZ,
                transform: playerAnim.current.getTranslateTransform(),
              },
            ]}
          >
            🧚‍♀️
          </Animated.Text>
        </View>
      </View>

      {/* ── D-Pad ── */}
      <View style={styles.dpad}>
        <DBtn onPressIn={() => startMove(-1, 0)} onPressOut={stopMove} label="▲" />
        <View style={styles.dRow}>
          <DBtn onPressIn={() => startMove(0, -1)} onPressOut={stopMove} label="◀" />
          <View style={styles.dCenter}>
            <Text style={styles.dCenterTxt}>🧭</Text>
          </View>
          <DBtn onPressIn={() => startMove(0, 1)} onPressOut={stopMove} label="▶" />
        </View>
        <DBtn onPressIn={() => startMove(1, 0)} onPressOut={stopMove} label="▼" />
      </View>

      {/* ── Level Complete overlay ── */}
      {won && (
        <View style={styles.overlay}>
          <Text style={styles.ovEmoji}>🎉</Text>
          <Text style={styles.ovWin}>Amazing!</Text>
          <Text style={styles.ovWorld}>{worldName(level)} cleared!</Text>
          <Text style={styles.ovSub}>Time left: {fmtTime(timeLeft)}</Text>
          <TouchableOpacity
            style={[styles.ovBtn, { backgroundColor: '#166534' }]}
            onPress={() => initLevel(level + 1, lives)}
          >
            <Text style={styles.ovBtnTxt}>Next World ✨</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ovHome} onPress={() => router.back()}>
            <Text style={styles.ovHomeTxt}>🏠 Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Game Over overlay ── */}
      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.ovEmoji}>💫</Text>
          <Text style={styles.ovLose}>Oh No!</Text>
          <Text style={styles.ovSub}>You reached level {level}</Text>
          <TouchableOpacity
            style={[styles.ovBtn, { backgroundColor: '#7c3aed' }]}
            onPress={() => initLevel(1, 3)}
          >
            <Text style={styles.ovBtnTxt}>🎮 Try Again!</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ovHome} onPress={() => router.back()}>
            <Text style={styles.ovHomeTxt}>🏠 Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── D-Pad Button component ───────────────────────────────────────────────────
function DBtn({
  label, onPressIn, onPressOut,
}: {
  label: string;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.dBtn}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={0.65}
    >
      <Text style={styles.dBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C_SCREEN,
    alignItems: 'center',
  },

  // ── HUD ──────────────────────────────────────────────────────────────────────
  hud: {
    width: '100%',
    height: 86,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: C_HUD_BG,
    borderBottomWidth: 2,
    borderBottomColor: C_GOLD,
    paddingHorizontal: 12,
    shadowColor: C_GOLD,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  hudItem:   { alignItems: 'center', flex: 1 },
  hudLabel:  { color: C_PURPLE, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  hudBig:    { color: '#fff', fontSize: 22, fontWeight: 'bold', lineHeight: 26 },
  hudWorld:  { color: C_GOLD, fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  hudHearts: { fontSize: 18, lineHeight: 24 },
  timeWarn:  { color: '#f87171' },

  // ── Maze ─────────────────────────────────────────────────────────────────────
  mazeFrame: {
    marginTop: 8,
    padding: 3,
    borderRadius: 8,
    backgroundColor: C_GOLD,
    shadowColor: C_GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 10,
  },
  mazeInner: {
    overflow: 'hidden',
    borderRadius: 5,
  },
  goalEmoji: {
    position: 'absolute',
    textAlign: 'center',
  },
  playerEmoji: {
    position: 'absolute',
    top: 0,
    left: 0,
    textAlign: 'center',
  },

  // ── D-Pad ─────────────────────────────────────────────────────────────────────
  dpad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dCenter: {
    width: 54, height: 54,
    backgroundColor: '#1a0840',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dCenterTxt: { fontSize: 28 },
  dBtn: {
    width: 54, height: 54,
    backgroundColor: '#1e0a4a',
    borderWidth: 2,
    borderColor: C_PURPLE,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C_PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  dBtnTxt: { color: '#e9d5ff', fontSize: 22 },

  // ── Overlays ─────────────────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,2,18,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ovEmoji: { fontSize: 80, marginBottom: 4 },
  ovWin: {
    color: C_GOLD,
    fontSize: 50,
    fontWeight: 'bold',
    textShadowColor: C_GOLD,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    marginBottom: 4,
  },
  ovLose: {
    color: '#f87171',
    fontSize: 50,
    fontWeight: 'bold',
    textShadowColor: '#f87171',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    marginBottom: 4,
  },
  ovWorld:  { color: C_PURPLE, fontSize: 18, marginBottom: 4 },
  ovSub:    { color: '#aaa', fontSize: 16, marginBottom: 36 },
  ovBtn: {
    paddingHorizontal: 52,
    paddingVertical: 16,
    borderRadius: 50,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 8,
  },
  ovBtnTxt: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  ovHome:   { paddingHorizontal: 52, paddingVertical: 14 },
  ovHomeTxt: { color: '#666', fontSize: 18 },
});
