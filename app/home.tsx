/**
 * Enchanted Maze — Home Screen
 * Animated entrance, floating stars, two game mode cards.
 */

import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W } = Dimensions.get('window');

const STARS = [
  { e: '✨', x: '6%',  y: '9%',  s: 22, g: 0 },
  { e: '⭐', x: '87%', y: '7%',  s: 18, g: 1 },
  { e: '💫', x: '4%',  y: '26%', s: 26, g: 0 },
  { e: '🌟', x: '82%', y: '32%', s: 20, g: 1 },
  { e: '✨', x: '2%',  y: '55%', s: 18, g: 0 },
  { e: '⭐', x: '91%', y: '60%', s: 22, g: 1 },
  { e: '🌟', x: '10%', y: '80%', s: 20, g: 0 },
  { e: '💫', x: '78%', y: '84%', s: 16, g: 1 },
  { e: '✨', x: '46%', y: '4%',  s: 16, g: 1 },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  // ── Animation values ────────────────────────────────────────────────────────
  const titleY    = useRef(new Animated.Value(-120)).current;
  const titleFade = useRef(new Animated.Value(0)).current;
  const card1X    = useRef(new Animated.Value(-W)).current;
  const card2X    = useRef(new Animated.Value(W)).current;
  const botFade   = useRef(new Animated.Value(0)).current;
  const titleGlow = useRef(new Animated.Value(0.75)).current;
  const mascotY   = useRef(new Animated.Value(0)).current;
  const float1    = useRef(new Animated.Value(0)).current;
  const float2    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // ── Entrance sequence ────────────────────────────────────────────────────
    Animated.sequence([
      Animated.parallel([
        Animated.spring(titleY,    { toValue: 0, tension: 55, friction: 8, useNativeDriver: true }),
        Animated.timing(titleFade, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(card1X, { toValue: 0, tension: 45, friction: 7, useNativeDriver: true }),
        Animated.spring(card2X, { toValue: 0, tension: 45, friction: 7, useNativeDriver: true }),
      ]),
      Animated.timing(botFade, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();

    // ── Continuous loops ─────────────────────────────────────────────────────
    Animated.loop(Animated.sequence([
      Animated.timing(titleGlow, { toValue: 1,    duration: 1300, useNativeDriver: true }),
      Animated.timing(titleGlow, { toValue: 0.65, duration: 1300, useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.timing(mascotY, { toValue: -14, duration: 1100, useNativeDriver: true }),
      Animated.timing(mascotY, { toValue:   0, duration: 1100, useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.timing(float1, { toValue: -18, duration: 2600, useNativeDriver: true }),
      Animated.timing(float1, { toValue:   0, duration: 2600, useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.timing(float2, { toValue: -12, duration: 2000, useNativeDriver: true }),
      Animated.timing(float2, { toValue:   0, duration: 2000, useNativeDriver: true }),
    ])).start();
  }, [botFade, card1X, card2X, float1, float2, mascotY, titleFade, titleGlow, titleY]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Floating background stars ── */}
      {STARS.map((s, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.floatStar,
            { top: s.y as any, left: s.x as any, fontSize: s.s },
            { transform: [{ translateY: s.g === 0 ? float1 : float2 }] },
          ]}
        >
          {s.e}
        </Animated.Text>
      ))}

      {/* ── Bobbing mascot ── */}
      <Animated.Text style={[styles.mascot, { transform: [{ translateY: mascotY }] }]}>
        🧚‍♀️
      </Animated.Text>

      {/* ── Title ── */}
      <Animated.View
        style={[
          styles.titleWrap,
          { opacity: titleFade, transform: [{ translateY: titleY }] },
        ]}
      >
        <Text style={styles.titleBadge}>✨  Enchanted  ✨</Text>
        <Animated.Text style={[styles.titleMain, { opacity: titleGlow }]}>
          MAZE
        </Animated.Text>
        <Text style={styles.titleTag}>🏰  Guide the fairy to the castle!</Text>
      </Animated.View>

      {/* ── Mode cards ── */}
      <View style={styles.cards}>
        <Animated.View style={[styles.halfCard, { transform: [{ translateX: card1X }] }]}>
          <TouchableOpacity
            style={[styles.card, styles.adventureCard]}
            onPress={() => router.push('/maze?mode=adventure&stage=1')}
            activeOpacity={0.82}
          >
            <Text style={styles.cardEmoji}>🗺️</Text>
            <Text style={[styles.cardTitle, { color: '#4ade80' }]}>ADVENTURE</Text>
            <Text style={styles.cardDesc}>{'Explore magical worlds\nEarn ⭐ stars!'}</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[styles.halfCard, { transform: [{ translateX: card2X }] }]}>
          <TouchableOpacity
            style={[styles.card, styles.timeCard]}
            onPress={() => router.push('/maze?mode=time')}
            activeOpacity={0.82}
          >
            <Text style={styles.cardEmoji}>⚡</Text>
            <Text style={[styles.cardTitle, { color: '#fb923c' }]}>TIME ATTACK</Text>
            <Text style={styles.cardDesc}>{'Race the clock\nBeat your best!'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ── Bottom row ── */}
      <Animated.View style={[styles.bottomRow, { opacity: botFade }]}>
        <View style={styles.infoChip}>
          <Text style={styles.infoEmoji}>🧚‍♀️</Text>
          <Text style={styles.infoTxt}>Swipe or use D-pad to move</Text>
        </View>
        <View style={styles.infoChip}>
          <Text style={styles.infoEmoji}>🏰</Text>
          <Text style={styles.infoTxt}>Reach the castle to win</Text>
        </View>
      </Animated.View>

      <Text style={styles.version}>✨  Enchanted Maze  •  v2.0  ✨</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080118',
    alignItems: 'center',
    justifyContent: 'center',
  },

  floatStar: { position: 'absolute', opacity: 0.5 },

  mascot: { fontSize: 78, marginBottom: 4 },

  titleWrap:  { alignItems: 'center', marginBottom: 36 },
  titleBadge: { color: '#c4b5fd', fontSize: 16, letterSpacing: 4, fontWeight: '600' },
  titleMain: {
    color: '#FFD700',
    fontSize: 72,
    fontWeight: 'bold',
    letterSpacing: 10,
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
    lineHeight: 80,
  },
  titleTag: { color: '#a78bfa', fontSize: 14, marginTop: 6 },

  cards: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 20,
    marginBottom: 24,
    width: '100%',
  },
  halfCard: { flex: 1 },
  card: {
    padding: 22,
    borderRadius: 24,
    alignItems: 'center',
    elevation: 14,
  },
  adventureCard: {
    backgroundColor: '#031a0a',
    borderWidth: 2.5,
    borderColor: '#4ade80',
    shadowColor: '#4ade80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
  },
  timeCard: {
    backgroundColor: '#1c0800',
    borderWidth: 2.5,
    borderColor: '#fb923c',
    shadowColor: '#fb923c',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
  },
  cardEmoji: { fontSize: 52, marginBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 8, letterSpacing: 1 },
  cardDesc:  { color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  bottomRow: {
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 24,
    width: '100%',
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  infoEmoji: { fontSize: 20 },
  infoTxt:   { color: 'rgba(255,255,255,0.5)', fontSize: 13 },

  version: { color: '#2a1a4a', fontSize: 11, letterSpacing: 1 },
});
