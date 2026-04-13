/**
 * Dragon Dodge 🧙‍♂️
 * Wizard moves left/right to dodge falling fireballs.
 * Score increases each time a fireball passes safely.
 */

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PLAYER_W  = 52;
const PLAYER_H  = 52;   // emoji hitbox
const OBSTACLE_W = 46;
const OBSTACLE_H = 46;
const PLAYER_Y  = SCREEN_H - 170;
const MOVE_STEP = 20;
const INIT_SPEED = 5;

// Decorative background stars (fixed, not animated for perf)
const BG_STARS = [
  { t: 90,  l: 30,  e: '✨', s: 14 },
  { t: 140, l: 340, e: '⭐', s: 12 },
  { t: 200, l: 15,  e: '💫', s: 16 },
  { t: 280, l: 360, e: '✨', s: 12 },
  { t: 420, l: 20,  e: '⭐', s: 14 },
  { t: 500, l: 350, e: '🌟', s: 12 },
];

function rndX() { return Math.random() * (SCREEN_W - OBSTACLE_W); }

export default function GameScreen() {
  // ── Refs (never stale in the interval) ──────────────────────────────────────
  const pxRef    = useRef((SCREEN_W - PLAYER_W) / 2);
  const oxRef    = useRef(rndX());
  const oyRef    = useRef(-OBSTACLE_H);
  const scoreRef = useRef(0);
  const speedRef = useRef(INIT_SPEED);
  const deadRef  = useRef(false);

  // ── State (triggers re-renders) ──────────────────────────────────────────────
  const [px,       setPx]       = useState(pxRef.current);
  const [ox,       setOx]       = useState(oxRef.current);
  const [oy,       setOy]       = useState(oyRef.current);
  const [score,    setScore]    = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const leftRef  = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const rightRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ── Movement ─────────────────────────────────────────────────────────────────
  const moveLeft = () => {
    pxRef.current = Math.max(0, pxRef.current - MOVE_STEP);
    setPx(pxRef.current);
  };
  const moveRight = () => {
    pxRef.current = Math.min(SCREEN_W - PLAYER_W, pxRef.current + MOVE_STEP);
    setPx(pxRef.current);
  };
  const startLeft = () => {
    if (deadRef.current) return;
    moveLeft();
    leftRef.current = setInterval(() => { if (!deadRef.current) moveLeft(); }, 60);
  };
  const stopLeft = () => {
    clearInterval(leftRef.current);
    leftRef.current = undefined;
  };
  const startRight = () => {
    if (deadRef.current) return;
    moveRight();
    rightRef.current = setInterval(() => { if (!deadRef.current) moveRight(); }, 60);
  };
  const stopRight = () => {
    clearInterval(rightRef.current);
    rightRef.current = undefined;
  };

  // ── Restart ───────────────────────────────────────────────────────────────────
  const restart = () => {
    pxRef.current    = (SCREEN_W - PLAYER_W) / 2;
    oxRef.current    = rndX();
    oyRef.current    = -OBSTACLE_H;
    scoreRef.current = 0;
    speedRef.current = INIT_SPEED;
    deadRef.current  = false;
    setPx(pxRef.current);
    setOx(oxRef.current);
    setOy(oyRef.current);
    setScore(0);
    setGameOver(false);
  };

  // ── Game loop (~60 fps) ───────────────────────────────────────────────────────
  useEffect(() => {
    const loop = setInterval(() => {
      if (deadRef.current) return;

      oyRef.current += speedRef.current;

      // Fireball exited screen → new one, score++
      if (oyRef.current > SCREEN_H) {
        oyRef.current    = -OBSTACLE_H;
        oxRef.current    = rndX();
        scoreRef.current += 1;
        speedRef.current = INIT_SPEED + scoreRef.current * 0.55;
        setScore(scoreRef.current);
      }

      // Collision (AABB)
      if (
        oxRef.current < pxRef.current + PLAYER_W &&
        oxRef.current + OBSTACLE_W > pxRef.current &&
        oyRef.current < PLAYER_Y + PLAYER_H &&
        oyRef.current + OBSTACLE_H > PLAYER_Y
      ) {
        deadRef.current = true;
        setGameOver(true);
        return;
      }

      setOy(oyRef.current);
      setOx(oxRef.current);
    }, 16);

    return () => clearInterval(loop);
  }, []);

  // Cleanup press intervals on unmount
  useEffect(() => () => { stopLeft(); stopRight(); }, []);

  return (
    <View style={styles.root}>
      {/* Background stars */}
      {BG_STARS.map((s, i) => (
        <Text key={i} style={[styles.bgStar, { top: s.t, left: s.l, fontSize: s.s }]}>
          {s.e}
        </Text>
      ))}

      {/* ── Score HUD ── */}
      <View style={styles.scoreBox}>
        <Text style={styles.scoreLabel}>⭐  SCORE</Text>
        <Text style={styles.scoreNum}>{score}</Text>
      </View>

      {/* ── Falling fireball ── */}
      <Text style={[styles.fireball, { left: ox, top: oy }]}>🔥</Text>

      {/* ── Wizard player ── */}
      <Text style={[styles.wizard, { left: px, top: PLAYER_Y }]}>🧙‍♂️</Text>

      {/* ── Ground line ── */}
      <View style={styles.ground} />

      {/* ── Controls ── */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.btn, styles.btnLeft]}
          onPressIn={startLeft}
          onPressOut={stopLeft}
          activeOpacity={0.7}
        >
          <Text style={styles.btnTxt}>◀</Text>
        </TouchableOpacity>

        <View style={styles.btnMid}>
          <Text style={styles.holdHint}>Hold to move</Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.btnRight]}
          onPressIn={startRight}
          onPressOut={stopRight}
          activeOpacity={0.7}
        >
          <Text style={styles.btnTxt}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* ── Game Over overlay ── */}
      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.oopsEmoji}>💫</Text>
          <Text style={styles.oopsTitle}>Oops!</Text>
          <Text style={styles.oopsSub}>A fireball got the wizard!</Text>
          <Text style={styles.oopsScore}>⭐  Score: {score}</Text>

          <TouchableOpacity style={styles.replayBtn} onPress={restart}>
            <Text style={styles.replayTxt}>🎮  Play Again!</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.homeBtn} onPress={() => router.back()}>
            <Text style={styles.homeTxt}>🏠  Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#08051e',
  },

  bgStar: {
    position: 'absolute',
    opacity: 0.45,
  },

  // ── HUD ──────────────────────────────────────────────────────────────────────
  scoreBox: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 18,
    paddingHorizontal: 28,
    paddingVertical: 8,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  scoreLabel: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  scoreNum: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: 'bold',
    lineHeight: 42,
  },

  // ── Characters ───────────────────────────────────────────────────────────────
  fireball: {
    position: 'absolute',
    fontSize: 40,
    width: OBSTACLE_W,
    height: OBSTACLE_H,
    textAlign: 'center',
  },
  wizard: {
    position: 'absolute',
    fontSize: 42,
    width: PLAYER_W,
    height: PLAYER_H,
    textAlign: 'center',
  },

  ground: {
    position: 'absolute',
    bottom: 138,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // ── Controls ─────────────────────────────────────────────────────────────────
  controls: {
    position: 'absolute',
    bottom: 38,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  btn: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  btnLeft: {
    backgroundColor: '#1e0a4a',
    borderWidth: 3,
    borderColor: '#7c3aed',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 14,
  },
  btnRight: {
    backgroundColor: '#1e0a4a',
    borderWidth: 3,
    borderColor: '#7c3aed',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 14,
  },
  btnTxt: {
    color: '#c4b5fd',
    fontSize: 36,
  },
  btnMid: { alignItems: 'center' },
  holdHint: { color: 'rgba(255,255,255,0.25)', fontSize: 11 },

  // ── Game Over ────────────────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,2,18,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oopsEmoji: { fontSize: 80, marginBottom: 4 },
  oopsTitle: {
    color: '#FFD700',
    fontSize: 56,
    fontWeight: 'bold',
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    marginBottom: 6,
  },
  oopsSub:   { color: '#c4b5fd', fontSize: 18, marginBottom: 10 },
  oopsScore: { color: '#FFD700', fontSize: 30, fontWeight: 'bold', marginBottom: 40 },
  replayBtn: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 52,
    paddingVertical: 16,
    borderRadius: 50,
    marginBottom: 16,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 16,
    elevation: 10,
  },
  replayTxt: { color: '#fff', fontSize: 21, fontWeight: 'bold' },
  homeBtn:   { paddingHorizontal: 52, paddingVertical: 14 },
  homeTxt:   { color: '#888', fontSize: 18 },
});
