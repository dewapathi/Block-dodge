import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PLAYER_W = 64;
const PLAYER_H = 22;
const OBSTACLE_W = 52;
const OBSTACLE_H = 22;
const PLAYER_Y = SCREEN_H - 160;
const MOVE_STEP = 18;
const INITIAL_SPEED = 5;

function randomObstacleX() {
  return Math.random() * (SCREEN_W - OBSTACLE_W);
}

export default function GameScreen() {
  const playerXRef = useRef((SCREEN_W - PLAYER_W) / 2);
  const obstacleXRef = useRef(randomObstacleX());
  const obstacleYRef = useRef(-OBSTACLE_H);
  const scoreRef = useRef(0);
  const speedRef = useRef(INITIAL_SPEED);
  const gameOverRef = useRef(false);

  const [playerX, setPlayerX] = useState(playerXRef.current);
  const [obstacleX, setObstacleX] = useState(obstacleXRef.current);
  const [obstacleY, setObstacleY] = useState(obstacleYRef.current);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  // Continuous press intervals
  const leftInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const rightInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const moveLeft = () => {
    playerXRef.current = Math.max(0, playerXRef.current - MOVE_STEP);
    setPlayerX(playerXRef.current);
  };

  const moveRight = () => {
    playerXRef.current = Math.min(SCREEN_W - PLAYER_W, playerXRef.current + MOVE_STEP);
    setPlayerX(playerXRef.current);
  };

  const startLeft = () => {
    if (gameOverRef.current) return;
    moveLeft();
    leftInterval.current = setInterval(() => {
      if (!gameOverRef.current) moveLeft();
    }, 60);
  };

  const stopLeft = () => {
    if (leftInterval.current) {
      clearInterval(leftInterval.current);
      leftInterval.current = null;
    }
  };

  const startRight = () => {
    if (gameOverRef.current) return;
    moveRight();
    rightInterval.current = setInterval(() => {
      if (!gameOverRef.current) moveRight();
    }, 60);
  };

  const stopRight = () => {
    if (rightInterval.current) {
      clearInterval(rightInterval.current);
      rightInterval.current = null;
    }
  };

  const restart = () => {
    playerXRef.current = (SCREEN_W - PLAYER_W) / 2;
    obstacleXRef.current = randomObstacleX();
    obstacleYRef.current = -OBSTACLE_H;
    scoreRef.current = 0;
    speedRef.current = INITIAL_SPEED;
    gameOverRef.current = false;

    setPlayerX(playerXRef.current);
    setObstacleX(obstacleXRef.current);
    setObstacleY(obstacleYRef.current);
    setScore(0);
    setGameOver(false);
  };

  // Game loop
  useEffect(() => {
    const loop = setInterval(() => {
      if (gameOverRef.current) return;

      // Drop obstacle
      obstacleYRef.current += speedRef.current;

      // Off-screen: reset and score
      if (obstacleYRef.current > SCREEN_H) {
        obstacleYRef.current = -OBSTACLE_H;
        obstacleXRef.current = randomObstacleX();
        scoreRef.current += 1;
        speedRef.current = INITIAL_SPEED + scoreRef.current * 0.6;
        setScore(scoreRef.current);
      }

      // Collision (AABB)
      const px = playerXRef.current;
      const ox = obstacleXRef.current;
      const oy = obstacleYRef.current;

      const hit =
        ox < px + PLAYER_W &&
        ox + OBSTACLE_W > px &&
        oy < PLAYER_Y + PLAYER_H &&
        oy + OBSTACLE_H > PLAYER_Y;

      if (hit) {
        gameOverRef.current = true;
        setGameOver(true);
        return;
      }

      setObstacleY(obstacleYRef.current);
      setObstacleX(obstacleXRef.current);
    }, 16);

    return () => clearInterval(loop);
  }, []);

  // Clean up press intervals on unmount
  useEffect(() => {
    return () => {
      stopLeft();
      stopRight();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.score}>{score}</Text>

      {/* Falling obstacle */}
      <View style={[styles.obstacle, { left: obstacleX, top: obstacleY }]} />

      {/* Player */}
      <View style={[styles.player, { left: playerX, top: PLAYER_Y }]} />

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.button}
          onPressIn={startLeft}
          onPressOut={stopLeft}
          activeOpacity={0.7}>
          <Text style={styles.buttonText}>◀</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPressIn={startRight}
          onPressOut={stopRight}
          activeOpacity={0.7}>
          <Text style={styles.buttonText}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* Game Over overlay */}
      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.gameOverTitle}>Game Over</Text>
          <Text style={styles.finalScore}>Score: {score}</Text>
          <TouchableOpacity style={styles.restartBtn} onPress={restart}>
            <Text style={styles.restartText}>Play Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.homeBtn} onPress={() => router.back()}>
            <Text style={styles.homeText}>Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  score: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    opacity: 0.8,
  },
  player: {
    position: 'absolute',
    width: PLAYER_W,
    height: PLAYER_H,
    backgroundColor: '#00d4ff',
    borderRadius: 5,
  },
  obstacle: {
    position: 'absolute',
    width: OBSTACLE_W,
    height: OBSTACLE_H,
    backgroundColor: '#ff4040',
    borderRadius: 5,
  },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 32,
  },
  button: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#1e1e2e',
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 34,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameOverTitle: {
    color: '#ff4040',
    fontSize: 52,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  finalScore: {
    color: '#fff',
    fontSize: 28,
    marginBottom: 48,
  },
  restartBtn: {
    backgroundColor: '#00d4ff',
    paddingHorizontal: 56,
    paddingVertical: 16,
    borderRadius: 10,
    marginBottom: 18,
  },
  restartText: {
    color: '#000',
    fontSize: 20,
    fontWeight: 'bold',
  },
  homeBtn: {
    paddingHorizontal: 56,
    paddingVertical: 14,
  },
  homeText: {
    color: '#888',
    fontSize: 18,
  },
});
