import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface GameCard {
  title: string;
  subtitle: string;
  accent: string;
  route: '/game' | '/maze';
  emoji: string;
}

const GAMES: GameCard[] = [
  {
    title: 'Block Dodge',
    subtitle: 'Move left & right\nDodge the falling blocks',
    accent: '#00d4ff',
    route: '/game',
    emoji: '🟦',
  },
  {
    title: 'Maze Runner',
    subtitle: 'Navigate the maze\nReach the goal in time',
    accent: '#ffd700',
    route: '/maze',
    emoji: '🪲',
  },
];

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.appTitle}>Mini Games</Text>
      <Text style={styles.appSub}>Choose your challenge</Text>

      {GAMES.map((g) => (
        <TouchableOpacity
          key={g.route}
          style={[styles.card, { borderColor: g.accent }]}
          onPress={() => router.push(g.route)}
          activeOpacity={0.8}
        >
          <Text style={styles.cardEmoji}>{g.emoji}</Text>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: g.accent }]}>{g.title}</Text>
            <Text style={styles.cardSub}>{g.subtitle}</Text>
          </View>
          <Text style={[styles.cardArrow, { color: g.accent }]}>▶</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  appTitle: {
    color: '#fff',
    fontSize: 46,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 6,
  },
  appSub: {
    color: '#666',
    fontSize: 16,
    marginBottom: 48,
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111122',
    borderWidth: 2,
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    gap: 16,
  },
  cardEmoji: { fontSize: 40 },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 22, fontWeight: 'bold' },
  cardSub: { color: '#888', fontSize: 13, lineHeight: 18 },
  cardArrow: { fontSize: 18, fontWeight: 'bold' },
});
