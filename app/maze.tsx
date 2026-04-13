/**
 * Maze Runner — procedurally generated maze game.
 *
 * Controls: D-pad buttons (hold for continuous movement) or swipe on the maze.
 * Goal: reach the pink circle at the bottom-right corner before the timer runs out.
 * Lives: 3. Lose one each time the timer expires. Gain nothing — pure skill.
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

// ─── Layout constants ────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const COLS = 9;
const WALL = 3;
const CELL = Math.floor((SCREEN_W - WALL * 2) / COLS);
const MAZE_W = CELL * COLS + WALL * 2;
const PLAYER_R = Math.floor(CELL * 0.3); // radius

// ─── Colours ─────────────────────────────────────────────────────────────────
const C_BG = '#d4e8c2';
const C_WALL = '#5D3A1A';
const C_PLAYER = '#cc2200';
const C_GOAL = '#ff69b4';
const C_HUD = '#4a7c2f';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pad(n: number) {
  return String(n).padStart(2, '0');
}
function fmtTime(s: number) {
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
function startingTime(level: number) {
  return Math.max(25, 90 - (level - 1) * 5);
}

// ─── Wall segments memo helper ────────────────────────────────────────────────
function buildWalls(maze: MazeGrid, rows: number) {
  type Seg = { key: string; t: number; l: number; w: number; h: number };
  const segs: Seg[] = [];
  if (!maze || maze.length === 0) return segs;
  const mazeH = CELL * rows;

  // Outer borders (leave gap at exit: bottom-right)
  segs.push({ key: 'ot', t: 0, l: 0, w: MAZE_W, h: WALL });
  segs.push({ key: 'ol', t: 0, l: 0, w: WALL, h: mazeH + WALL });
  segs.push({ key: 'or', t: 0, l: MAZE_W - WALL, w: WALL, h: mazeH + WALL });
  // Bottom border split — gap at last column for exit
  segs.push({ key: 'ob1', t: mazeH, l: 0, w: MAZE_W - CELL - WALL, h: WALL });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = maze[r][c];
      const x = WALL + c * CELL;
      const y = WALL + r * CELL;

      if (cell.right && c < COLS - 1) {
        segs.push({
          key: `rw${r}_${c}`,
          t: y - WALL,
          l: x + CELL - WALL,
          w: WALL,
          h: CELL + WALL,
        });
      }
      if (cell.bottom && !(r === rows - 1 && c === COLS - 1)) {
        segs.push({
          key: `bw${r}_${c}`,
          t: y + CELL - WALL,
          l: x - WALL,
          w: CELL + WALL,
          h: WALL,
        });
      }
    }
  }
  return segs;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MazeGame() {
  const insets = useSafeAreaInsets();

  // ── Compute rows from available height ──────────────────────────────────────
  const HUD_H = 76;
  const CTRL_H = 190;
  const availH = SCREEN_H - HUD_H - CTRL_H - insets.top - insets.bottom - 16;
  const ROWS = Math.max(8, Math.floor(availH / CELL));
  const MAZE_H = CELL * ROWS + WALL * 2;

  // ── Refs (mutable game state — no stale-closure issues) ───────────────────
  const mazeRef = useRef<MazeGrid>([]);
  const playerRef = useRef({ r: 0, c: 0 });
  const wonRef = useRef(false);
  const gameOverRef = useRef(false);
  const levelRef = useRef(1);
  const livesRef = useRef(3);
  const timeRef = useRef(startingTime(1));
  const timerIdRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const dpadIdRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const playerAnim = useRef(
    new Animated.ValueXY({
      x: WALL + (CELL - PLAYER_R * 2) / 2,
      y: WALL + (CELL - PLAYER_R * 2) / 2,
    })
  );

  // ── React state (only for re-rendering) ───────────────────────────────────
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(startingTime(1));
  const [won, setWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [mazeVersion, setMazeVersion] = useState(0); // bumped on new maze

  // ── Initialise / reset a level ─────────────────────────────────────────────
  function initLevel(lvl: number, currentLives: number) {
    clearInterval(timerIdRef.current);
    const maze = generateMaze(ROWS, COLS);
    mazeRef.current = maze;
    playerRef.current = { r: 0, c: 0 };
    wonRef.current = false;
    gameOverRef.current = false;
    levelRef.current = lvl;
    livesRef.current = currentLives;
    const t = startingTime(lvl);
    timeRef.current = t;

    playerAnim.current.stopAnimation();
    playerAnim.current.setValue({
      x: WALL + (CELL - PLAYER_R * 2) / 2,
      y: WALL + (CELL - PLAYER_R * 2) / 2,
    });

    setLevel(lvl);
    setLives(currentLives);
    setTimeLeft(t);
    setWon(false);
    setGameOver(false);
    setMazeVersion((v) => v + 1);

    startTimer();
  }

  function startTimer() {
    clearInterval(timerIdRef.current);
    timerIdRef.current = setInterval(() => {
      if (wonRef.current || gameOverRef.current) return;
      timeRef.current -= 1;
      setTimeLeft(timeRef.current);

      if (timeRef.current <= 0) {
        clearInterval(timerIdRef.current);
        const newLives = livesRef.current - 1;
        livesRef.current = newLives;
        setLives(newLives);
        if (newLives <= 0) {
          gameOverRef.current = true;
          setGameOver(true);
        } else {
          initLevel(levelRef.current, newLives);
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

  // ── Player movement ───────────────────────────────────────────────────────
  function move(dr: number, dc: number) {
    if (wonRef.current || gameOverRef.current) return;
    const { r, c } = playerRef.current;
    const cell = mazeRef.current[r]?.[c];
    if (!cell) return;

    const blocked =
      (dr === -1 && cell.top) ||
      (dr === 1 && cell.bottom) ||
      (dc === -1 && cell.left) ||
      (dc === 1 && cell.right);

    if (!blocked) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        playerRef.current = { r: nr, c: nc };

        const tx = WALL + nc * CELL + (CELL - PLAYER_R * 2) / 2;
        const ty = WALL + nr * CELL + (CELL - PLAYER_R * 2) / 2;
        Animated.timing(playerAnim.current, {
          toValue: { x: tx, y: ty },
          duration: 110,
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

  // ── D-pad: hold to repeat ─────────────────────────────────────────────────
  function startMove(dr: number, dc: number) {
    clearInterval(dpadIdRef.current);
    move(dr, dc);
    dpadIdRef.current = setInterval(() => move(dr, dc), 150);
  }
  function stopMove() {
    clearInterval(dpadIdRef.current);
  }

  // ── Swipe gesture on maze ─────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gs) => {
        const { dx, dy } = gs;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 15) move(0, 1);
          else if (dx < -15) move(0, -1);
        } else {
          if (dy > 15) move(1, 0);
          else if (dy < -15) move(-1, 0);
        }
      },
    })
  ).current;

  // ── Wall segments (recomputed only when maze changes) ─────────────────────
  const wallSegs = useMemo(
    () => buildWalls(mazeRef.current, ROWS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mazeVersion]
  );

  const goalX = WALL + (COLS - 1) * CELL + (CELL - PLAYER_R * 2) / 2;
  const goalY = WALL + (ROWS - 1) * CELL + (CELL - PLAYER_R * 2) / 2;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* HUD */}
      <View style={styles.hud}>
        <View style={styles.hudItem}>
          <Text style={styles.hudLabel}>LEVEL</Text>
          <Text style={styles.hudValue}>{level}</Text>
        </View>
        <View style={styles.hudItem}>
          <Text style={styles.hudLabel}>TIME</Text>
          <Text style={[styles.hudValue, timeLeft <= 10 && styles.timeWarn]}>
            {fmtTime(timeLeft)}
          </Text>
        </View>
        <View style={styles.hudItem}>
          <Text style={styles.hudLabel}>LIVES</Text>
          <Text style={styles.hudValue}>{'♥ '.repeat(lives).trim()}</Text>
        </View>
      </View>

      {/* Maze */}
      <View
        style={[styles.mazeWrap, { width: MAZE_W, height: MAZE_H }]}
        {...panResponder.panHandlers}
      >
        <View style={{ width: MAZE_W, height: MAZE_H, backgroundColor: C_BG }}>
          {wallSegs.map((s) => (
            <View
              key={s.key}
              style={{
                position: 'absolute',
                top: s.t,
                left: s.l,
                width: s.w,
                height: s.h,
                backgroundColor: C_WALL,
              }}
            />
          ))}

          {/* Goal */}
          <View
            style={[
              styles.dot,
              {
                left: goalX,
                top: goalY,
                width: PLAYER_R * 2,
                height: PLAYER_R * 2,
                borderRadius: PLAYER_R,
                backgroundColor: C_GOAL,
              },
            ]}
          />

          {/* Player */}
          <Animated.View
            style={[
              styles.dot,
              {
                width: PLAYER_R * 2,
                height: PLAYER_R * 2,
                borderRadius: PLAYER_R,
                backgroundColor: C_PLAYER,
                borderWidth: 2,
                borderColor: '#800000',
                transform: playerAnim.current.getTranslateTransform(),
              },
            ]}
          />
        </View>
      </View>

      {/* D-Pad */}
      <View style={styles.dpad}>
        <TouchableOpacity
          style={styles.dBtn}
          onPressIn={() => startMove(-1, 0)}
          onPressOut={stopMove}
          activeOpacity={0.65}
        >
          <Text style={styles.dTxt}>▲</Text>
        </TouchableOpacity>
        <View style={styles.dRow}>
          <TouchableOpacity
            style={styles.dBtn}
            onPressIn={() => startMove(0, -1)}
            onPressOut={stopMove}
            activeOpacity={0.65}
          >
            <Text style={styles.dTxt}>◀</Text>
          </TouchableOpacity>
          <View style={styles.dMid} />
          <TouchableOpacity
            style={styles.dBtn}
            onPressIn={() => startMove(0, 1)}
            onPressOut={stopMove}
            activeOpacity={0.65}
          >
            <Text style={styles.dTxt}>▶</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.dBtn}
          onPressIn={() => startMove(1, 0)}
          onPressOut={stopMove}
          activeOpacity={0.65}
        >
          <Text style={styles.dTxt}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Level Complete */}
      {won && (
        <View style={styles.overlay}>
          <Text style={styles.wonTitle}>Level {level} Complete!</Text>
          <Text style={styles.overlaySub}>Time remaining: {fmtTime(timeLeft)}</Text>
          <TouchableOpacity
            style={[styles.overlayBtn, { backgroundColor: C_HUD }]}
            onPress={() => initLevel(level + 1, lives)}
          >
            <Text style={styles.overlayBtnTxt}>Next Level →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.overlayHome} onPress={() => router.back()}>
            <Text style={styles.overlayHomeTxt}>Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Game Over */}
      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.loseTitle}>Game Over</Text>
          <Text style={styles.overlaySub}>You reached level {level}</Text>
          <TouchableOpacity
            style={[styles.overlayBtn, { backgroundColor: '#00d4ff' }]}
            onPress={() => initLevel(1, 3)}
          >
            <Text style={[styles.overlayBtnTxt, { color: '#000' }]}>Play Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.overlayHome} onPress={() => router.back()}>
            <Text style={styles.overlayHomeTxt}>Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
  },
  hud: {
    width: '100%',
    height: 76,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: C_HUD,
    paddingHorizontal: 16,
  },
  hudItem: { alignItems: 'center' },
  hudLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  hudValue: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  timeWarn: { color: '#ff4040' },
  mazeWrap: { marginTop: 8 },
  dot: { position: 'absolute' },
  dpad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dMid: { width: 54, height: 54, backgroundColor: '#222' },
  dBtn: {
    width: 54,
    height: 54,
    backgroundColor: '#2a2a3e',
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dTxt: { color: '#fff', fontSize: 22 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  wonTitle: { color: '#ffd700', fontSize: 40, fontWeight: 'bold', marginBottom: 10 },
  loseTitle: { color: '#ff4040', fontSize: 46, fontWeight: 'bold', marginBottom: 10 },
  overlaySub: { color: '#ccc', fontSize: 18, marginBottom: 36 },
  overlayBtn: {
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 10,
    marginBottom: 14,
  },
  overlayBtnTxt: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  overlayHome: { paddingHorizontal: 48, paddingVertical: 14 },
  overlayHomeTxt: { color: '#888', fontSize: 18 },
});
