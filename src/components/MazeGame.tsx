import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MazeGenerator } from '../utils/mazeGenerator';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Settings, Cloud, Sun, CloudRain, CloudSnow, Heart } from 'lucide-react';

interface Position {
  x: number;
  z: number;
}

interface Enemy {
  id: string;
  mesh: THREE.Mesh;
  position: Position;
  health: number;
  lastAttack: number;
  patrolPath: Position[];
  currentPathIndex: number;
  speed: number;
}

interface Checkpoint {
  position: Position;
  mesh: THREE.Mesh;
  activated: boolean;
}

type GraphicsQuality = 'low' | 'medium' | 'high';
type TimeOfDay = 'day' | 'night' | 'sunset' | 'dawn';
type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy';

const MazeGame: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [gameWon, setGameWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>('low');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [weather, setWeather] = useState<WeatherType>('sunny');
  const [lives, setLives] = useState(3);
  const [currentCheckpoint, setCurrentCheckpoint] = useState<Position>({ x: 1, z: 1 });
  const [isRespawning, setIsRespawning] = useState(false);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const mazeRef = useRef<number[][]>([]);
  const wallsRef = useRef<THREE.Mesh[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const checkpointsRef = useRef<Checkpoint[]>([]);
  const playerPositionRef = useRef<Position>({ x: 1, z: 1 });
  const exitPositionRef = useRef<Position>({ x: 0, z: 0 });
  const moveStateRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false
  });

  const MAZE_SIZE = 21;
  const WALL_HEIGHT = 3;
  const WALL_SIZE = 2;
  const MOVE_SPEED = 0.1;
  const ENEMY_SPEED = 0.05;
  const ENEMY_ATTACK_RANGE = 3;
  const ENEMY_ATTACK_COOLDOWN = 2000;
  const RESPAWN_DELAY = 2000;

  const getEnvironmentSettings = (time: TimeOfDay, weatherType: WeatherType, quality: GraphicsQuality) => {
    const timeSettings = {
      day: {
        skyColor: 0x87CEEB,
        fogColor: 0x87CEEB,
        ambientIntensity: 0.4,
        directionalIntensity: 1.0,
        directionalColor: 0xffffff,
        groundColor: 0x90EE90
      },
      night: {
        skyColor: 0x191970,
        fogColor: 0x191970,
        ambientIntensity: 0.1,
        directionalIntensity: 0.3,
        directionalColor: 0x6495ED,
        groundColor: 0x2F4F2F
      },
      sunset: {
        skyColor: 0xFF6347,
        fogColor: 0xFF6347,
        ambientIntensity: 0.3,
        directionalIntensity: 0.7,
        directionalColor: 0xFFA500,
        groundColor: 0x8FBC8F
      },
      dawn: {
        skyColor: 0xFFB6C1,
        fogColor: 0xFFB6C1,
        ambientIntensity: 0.2,
        directionalIntensity: 0.5,
        directionalColor: 0xFFE4B5,
        groundColor: 0x98FB98
      }
    };

    const weatherSettings = {
      sunny: {
        fogDensity: 1.0,
        fogNear: 10,
        precipitation: false
      },
      cloudy: {
        fogDensity: 0.7,
        fogNear: 8,
        precipitation: false
      },
      rainy: {
        fogDensity: 0.5,
        fogNear: 6,
        precipitation: true,
        precipitationType: 'rain'
      },
      snowy: {
        fogDensity: 0.4,
        fogNear: 5,
        precipitation: true,
        precipitationType: 'snow'
      }
    };

    return {
      ...timeSettings[time],
      ...weatherSettings[weatherType],
      ...getGraphicsSettings(quality)
    };
  };

  const getGraphicsSettings = (quality: GraphicsQuality) => {
    switch (quality) {
      case 'low':
        return {
          shadowMapSize: 512,
          antialias: false,
          shadowMapType: THREE.BasicShadowMap,
          fogFar: 30,
          ambientIntensity: 0.6,
          directionalIntensity: 0.8,
          enableShadows: false,
          wallSegments: 1,
          enableEdgeSmoothing: false,
          enableGrass: false
        };
      case 'medium':
        return {
          shadowMapSize: 1024,
          antialias: true,
          shadowMapType: THREE.PCFShadowMap,
          fogFar: 40,
          ambientIntensity: 0.4,
          directionalIntensity: 0.9,
          enableShadows: true,
          wallSegments: 2,
          enableEdgeSmoothing: true,
          enableGrass: false
        };
      case 'high':
        return {
          shadowMapSize: 2048,
          antialias: true,
          shadowMapType: THREE.PCFSoftShadowMap,
          fogFar: 50,
          ambientIntensity: 0.3,
          directionalIntensity: 1.0,
          enableShadows: true,
          wallSegments: 4,
          enableEdgeSmoothing: true,
          enableGrass: true
        };
    }
  };

  const updateEnvironment = () => {
    if (!sceneRef.current || !rendererRef.current) return;

    const settings = getEnvironmentSettings(timeOfDay, weather, graphicsQuality);
    const scene = sceneRef.current;

    scene.background = new THREE.Color(settings.skyColor);
    scene.fog = new THREE.Fog(settings.fogColor, settings.fogNear, settings.fogFar * settings.fogDensity);

    const ambientLight = scene.getObjectByName('ambientLight') as THREE.AmbientLight;
    const directionalLight = scene.getObjectByName('directionalLight') as THREE.DirectionalLight;

    if (ambientLight) {
      ambientLight.intensity = settings.ambientIntensity;
    }

    if (directionalLight) {
      directionalLight.intensity = settings.directionalIntensity;
      directionalLight.color.setHex(settings.directionalColor);
    }

    const ground = scene.getObjectByName('ground') as THREE.Mesh;
    if (ground && ground.material instanceof THREE.MeshLambertMaterial) {
      ground.material.color.setHex(settings.groundColor);
    }

    handlePrecipitation(scene, settings);
  };

  const handlePrecipitation = (scene: THREE.Scene, settings: any) => {
    const existingPrecipitation = scene.getObjectByName('precipitation');
    if (existingPrecipitation) {
      scene.remove(existingPrecipitation);
    }

    if (!settings.precipitation) return;

    const precipitationGroup = new THREE.Group();
    precipitationGroup.name = 'precipitation';

    const particleCount = 1000;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 100;
      positions[i + 1] = Math.random() * 50 + 10;
      positions[i + 2] = (Math.random() - 0.5) * 100;
    }

    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: settings.precipitationType === 'snow' ? 0xffffff : 0x0066ff,
      size: settings.precipitationType === 'snow' ? 0.1 : 0.05,
      transparent: true,
      opacity: 0.6
    });

    const precipitationMesh = new THREE.Points(particles, material);
    precipitationGroup.add(precipitationMesh);
    scene.add(precipitationGroup);
  };

  const createEnemies = (scene: THREE.Scene, maze: number[][], settings: any) => {
    const enemies: Enemy[] = [];
    const enemyCount = Math.floor(MAZE_SIZE * MAZE_SIZE * 0.05); // 5% of maze cells

    for (let i = 0; i < enemyCount; i++) {
      let x, z;
      do {
        x = Math.floor(Math.random() * MAZE_SIZE);
        z = Math.floor(Math.random() * MAZE_SIZE);
      } while (maze[z][x] === 1 || (x === 1 && z === 1)); // Don't spawn on walls or start position

      const enemyGeometry = new THREE.SphereGeometry(0.5, 8, 8);
      const enemyMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xff0000,
        emissive: 0x440000
      });
      const enemyMesh = new THREE.Mesh(enemyGeometry, enemyMaterial);
      
      enemyMesh.position.set(
        (x - MAZE_SIZE / 2) * WALL_SIZE,
        0.5,
        (z - MAZE_SIZE / 2) * WALL_SIZE
      );

      if (settings.enableShadows) {
        enemyMesh.castShadow = true;
      }

      scene.add(enemyMesh);

      // Create patrol path
      const patrolPath: Position[] = [];
      const pathLength = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < pathLength; j++) {
        let px, pz;
        do {
          px = Math.max(0, Math.min(MAZE_SIZE - 1, x + Math.floor(Math.random() * 6) - 3));
          pz = Math.max(0, Math.min(MAZE_SIZE - 1, z + Math.floor(Math.random() * 6) - 3));
        } while (maze[pz][px] === 1);
        patrolPath.push({ x: px, z: pz });
      }

      enemies.push({
        id: `enemy_${i}`,
        mesh: enemyMesh,
        position: { x, z },
        health: 100,
        lastAttack: 0,
        patrolPath,
        currentPathIndex: 0,
        speed: ENEMY_SPEED
      });
    }

    enemiesRef.current = enemies;
  };

  const createCheckpoints = (scene: THREE.Scene, maze: number[][], settings: any) => {
    const checkpoints: Checkpoint[] = [];
    const checkpointCount = 3;

    for (let i = 0; i < checkpointCount; i++) {
      let x, z;
      do {
        x = Math.floor(Math.random() * MAZE_SIZE);
        z = Math.floor(Math.random() * MAZE_SIZE);
      } while (maze[z][x] === 1 || (x === 1 && z === 1)); // Don't spawn on walls or start position

      const checkpointGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
      const checkpointMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x00ff00,
        emissive: 0x004400
      });
      const checkpointMesh = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
      
      checkpointMesh.position.set(
        (x - MAZE_SIZE / 2) * WALL_SIZE,
        0.1,
        (z - MAZE_SIZE / 2) * WALL_SIZE
      );

      if (settings.enableShadows) {
        checkpointMesh.castShadow = true;
      }

      scene.add(checkpointMesh);

      checkpoints.push({
        position: { x, z },
        mesh: checkpointMesh,
        activated: false
      });
    }

    checkpointsRef.current = checkpoints;
  };

  const updateEnemies = () => {
    if (!sceneRef.current || !cameraRef.current) return;

    const currentTime = Date.now();
    const playerPos = playerPositionRef.current;

    enemiesRef.current.forEach(enemy => {
      // Update patrol movement
      if (enemy.patrolPath.length > 0) {
        const targetPos = enemy.patrolPath[enemy.currentPathIndex];
        const dx = targetPos.x - enemy.position.x;
        const dz = targetPos.z - enemy.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < 0.5) {
          enemy.currentPathIndex = (enemy.currentPathIndex + 1) % enemy.patrolPath.length;
        } else {
          enemy.position.x += (dx / distance) * enemy.speed;
          enemy.position.z += (dz / distance) * enemy.speed;
          
          enemy.mesh.position.set(
            (enemy.position.x - MAZE_SIZE / 2) * WALL_SIZE,
            0.5,
            (enemy.position.z - MAZE_SIZE / 2) * WALL_SIZE
          );
        }
      }

      // Check for player attack
      const playerDistance = Math.sqrt(
        Math.pow(playerPos.x - enemy.position.x, 2) + 
        Math.pow(playerPos.z - enemy.position.z, 2)
      );

      if (playerDistance < ENEMY_ATTACK_RANGE && 
          currentTime - enemy.lastAttack > ENEMY_ATTACK_COOLDOWN &&
          !isRespawning) {
        enemy.lastAttack = currentTime;
        attackPlayer();
      }
    });
  };

  const attackPlayer = () => {
    if (isRespawning) return;
    
    const newLives = lives - 1;
    setLives(newLives);
    
    if (newLives <= 0) {
      setGameOver(true);
      toast.error("Game Over! You've run out of lives!");
    } else {
      toast.error(`You've been attacked! Lives remaining: ${newLives}`);
      respawnPlayer();
    }
  };

  const respawnPlayer = () => {
    if (!cameraRef.current) return;
    
    setIsRespawning(true);
    
    setTimeout(() => {
      if (cameraRef.current) {
        cameraRef.current.position.set(
          (currentCheckpoint.x - MAZE_SIZE / 2) * WALL_SIZE,
          1.6,
          (currentCheckpoint.z - MAZE_SIZE / 2) * WALL_SIZE
        );
        playerPositionRef.current = { ...currentCheckpoint };
        setIsRespawning(false);
        toast.success("Respawned at checkpoint!");
      }
    }, RESPAWN_DELAY);
  };

  const checkCheckpoints = () => {
    const playerPos = playerPositionRef.current;
    
    checkpointsRef.current.forEach(checkpoint => {
      if (!checkpoint.activated) {
        const distance = Math.sqrt(
          Math.pow(playerPos.x - checkpoint.position.x, 2) + 
          Math.pow(playerPos.z - checkpoint.position.z, 2)
        );

        if (distance < 2) {
          checkpoint.activated = true;
          setCurrentCheckpoint(checkpoint.position);
          checkpoint.mesh.material = new THREE.MeshLambertMaterial({ 
            color: 0xffff00,
            emissive: 0x444400
          });
          toast.success("Checkpoint activated!");
        }
      }
    });
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const settings = getEnvironmentSettings(timeOfDay, weather, graphicsQuality);

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(settings.skyColor);
    scene.fog = new THREE.Fog(settings.fogColor, settings.fogNear, settings.fogFar * settings.fogDensity);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(WALL_SIZE, 1.6, WALL_SIZE);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: settings.antialias });
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (settings.enableShadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = settings.shadowMapType;
    }
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Lighting with names for easy updates
    const ambientLight = new THREE.AmbientLight(0x404040, settings.ambientIntensity);
    ambientLight.name = 'ambientLight';
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(settings.directionalColor, settings.directionalIntensity);
    directionalLight.name = 'directionalLight';
    directionalLight.position.set(10, 20, 10);
    if (settings.enableShadows) {
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = settings.shadowMapSize;
      directionalLight.shadow.mapSize.height = settings.shadowMapSize;
      directionalLight.shadow.camera.near = 0.1;
      directionalLight.shadow.camera.far = 50;
      directionalLight.shadow.camera.left = -25;
      directionalLight.shadow.camera.right = 25;
      directionalLight.shadow.camera.top = 25;
      directionalLight.shadow.camera.bottom = -25;
      directionalLight.shadow.bias = -0.001;
    }
    scene.add(directionalLight);

    // Generate maze
    const mazeGenerator = new MazeGenerator(MAZE_SIZE, MAZE_SIZE);
    const maze = mazeGenerator.generate();
    mazeRef.current = maze;

    let exitFound = false;
    for (let x = MAZE_SIZE - 2; x >= MAZE_SIZE - 4 && !exitFound; x--) {
      for (let z = MAZE_SIZE - 2; z >= MAZE_SIZE - 4 && !exitFound; z--) {
        if (maze[z][x] === 0) {
          exitPositionRef.current = { x, z };
          exitFound = true;
        }
      }
    }

    // Create maze walls and floor
    createMaze(scene, maze, settings);

    // Create exit marker
    createExitMarker(scene, settings);

    // Create enemies and checkpoints
    createEnemies(scene, maze, settings);
    createCheckpoints(scene, maze, settings);

    // Ground with name for easy updates
    const groundGeometry = new THREE.PlaneGeometry(MAZE_SIZE * WALL_SIZE, MAZE_SIZE * WALL_SIZE);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: settings.groundColor });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.name = 'ground';
    ground.rotation.x = -Math.PI / 2;
    if (settings.enableShadows) {
      ground.receiveShadow = true;
    }
    scene.add(ground);

    if (settings.enableGrass) {
      createGrass(scene, maze, settings);
    }

    // Handle precipitation
    handlePrecipitation(scene, settings);

    // PointerLockControls
    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;

    // Event listeners
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveStateRef.current.forward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveStateRef.current.left = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveStateRef.current.backward = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveStateRef.current.right = true;
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveStateRef.current.forward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveStateRef.current.left = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveStateRef.current.backward = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveStateRef.current.right = false;
          break;
      }
    };

    const onResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    const onLock = () => setIsLocked(true);
    const onUnlock = () => setIsLocked(false);
    
    controls.addEventListener('lock', onLock);
    controls.addEventListener('unlock', onUnlock);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      if (controls.isLocked && !gameWon && !gameOver) {
        updateMovement();
        updateEnemies();
        checkCheckpoints();
        checkWinCondition();
      }

      const precipitation = scene.getObjectByName('precipitation');
      if (precipitation) {
        precipitation.children.forEach((child) => {
          if (child instanceof THREE.Points) {
            const positions = child.geometry.attributes.position.array as Float32Array;
            for (let i = 1; i < positions.length; i += 3) {
              positions[i] -= weather === 'snowy' ? 0.1 : 0.3;
              if (positions[i] < 0) {
                positions[i] = 50;
              }
            }
            child.geometry.attributes.position.needsUpdate = true;
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    toast.success("Maze loaded! Avoid enemies and find checkpoints!");

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      
      controls.removeEventListener('lock', onLock);
      controls.removeEventListener('unlock', onUnlock);
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [graphicsQuality, timeOfDay, weather]);

  useEffect(() => {
    updateEnvironment();
  }, [timeOfDay, weather]);

  const createMaze = (scene: THREE.Scene, maze: number[][], settings: any) => {
    const wallGeometry = new THREE.BoxGeometry(
      WALL_SIZE, 
      WALL_HEIGHT, 
      WALL_SIZE,
      settings.wallSegments,
      settings.wallSegments,
      settings.wallSegments
    );
    
    const wallMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x8B4513,
      map: createBrickTexture(settings)
    });

    if (settings.enableEdgeSmoothing) {
      const edges = new THREE.EdgesGeometry(wallGeometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x654321 });
      
      wallsRef.current = [];

      for (let z = 0; z < maze.length; z++) {
        for (let x = 0; x < maze[z].length; x++) {
          if (maze[z][x] === 1) {
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            const wireframe = new THREE.LineSegments(edges, edgeMaterial);
            
            const position = new THREE.Vector3(
              (x - MAZE_SIZE / 2) * WALL_SIZE,
              WALL_HEIGHT / 2,
              (z - MAZE_SIZE / 2) * WALL_SIZE
            );
            
            wall.position.copy(position);
            wireframe.position.copy(position);
            
            if (settings.enableShadows) {
              wall.castShadow = true;
              wall.receiveShadow = true;
            }
            
            scene.add(wall);
            scene.add(wireframe);
            wallsRef.current.push(wall);
          }
        }
      }
    } else {
      wallsRef.current = [];

      for (let z = 0; z < maze.length; z++) {
        for (let x = 0; x < maze[z].length; x++) {
          if (maze[z][x] === 1) {
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            wall.position.set(
              (x - MAZE_SIZE / 2) * WALL_SIZE,
              WALL_HEIGHT / 2,
              (z - MAZE_SIZE / 2) * WALL_SIZE
            );
            if (settings.enableShadows) {
              wall.castShadow = true;
              wall.receiveShadow = true;
            }
            scene.add(wall);
            wallsRef.current.push(wall);
          }
        }
      }
    }
  };

  const createBrickTexture = (settings: any) => {
    const size = settings.enableEdgeSmoothing ? 128 : 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, 0, size, size);
    
    if (settings.enableEdgeSmoothing) {
      ctx.fillStyle = '#A0522D';
      for (let y = 0; y < size; y += size / 8) {
        for (let x = 0; x < size; x += size / 4) {
          const offset = (Math.floor(y / (size / 8)) % 2) * (size / 8);
          ctx.fillRect(x + offset, y, size / 4 - 2, size / 8 - 2);
        }
      }
      
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 1;
      for (let y = 0; y < size; y += size / 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#A0522D';
      ctx.fillRect(0, 0, size / 2, size / 4);
      ctx.fillRect(size / 2, size / 4, size / 2, size / 4);
      ctx.fillRect(0, size / 2, size / 2, size / 4);
      ctx.fillRect(size / 2, size * 3 / 4, size / 2, size / 4);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(settings.enableEdgeSmoothing ? 3 : 2, settings.enableEdgeSmoothing ? 3 : 2);
    
    return texture;
  };

  const createGrass = (scene: THREE.Scene, maze: number[][], settings: any) => {
    const grassGroup = new THREE.Group();
    
    for (let z = 0; z < maze.length; z++) {
      for (let x = 0; x < maze[z].length; x++) {
        if (maze[z][x] === 0) {
          const grassCount = Math.random() * 15 + 5;
          
          for (let i = 0; i < grassCount; i++) {
            const grassGeometry = new THREE.CylinderGeometry(0.01, 0.02, 0.3, 3);
            const grassMaterial = new THREE.MeshLambertMaterial({ 
              color: new THREE.Color().setHSL(0.25 + Math.random() * 0.1, 0.8, 0.4 + Math.random() * 0.2)
            });
            const grassBlade = new THREE.Mesh(grassGeometry, grassMaterial);
            
            const offsetX = (Math.random() - 0.5) * WALL_SIZE * 0.8;
            const offsetZ = (Math.random() - 0.5) * WALL_SIZE * 0.8;
            
            grassBlade.position.set(
              (x - MAZE_SIZE / 2) * WALL_SIZE + offsetX,
              0.15,
              (z - MAZE_SIZE / 2) * WALL_SIZE + offsetZ
            );
            
            grassBlade.rotation.y = Math.random() * Math.PI * 2;
            grassBlade.rotation.x = (Math.random() - 0.5) * 0.2;
            grassBlade.scale.y = 0.8 + Math.random() * 0.4;
            
            if (settings.enableShadows) {
              grassBlade.castShadow = true;
            }
            
            grassGroup.add(grassBlade);
          }
        }
      }
    }
    
    scene.add(grassGroup);
  };

  const createExitMarker = (scene: THREE.Scene, settings: any) => {
    const exitGeometry = new THREE.CylinderGeometry(0.5, 0.5, 4, 8);
    const exitMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xFF6B6B,
      emissive: 0x442222
    });
    const exitMarker = new THREE.Mesh(exitGeometry, exitMaterial);
    
    exitMarker.position.set(
      (exitPositionRef.current.x - MAZE_SIZE / 2) * WALL_SIZE,
      2,
      (exitPositionRef.current.z - MAZE_SIZE / 2) * WALL_SIZE
    );
    
    if (settings.enableShadows) {
      exitMarker.castShadow = true;
    }
    
    scene.add(exitMarker);

    const exitLight = new THREE.PointLight(0xFF6B6B, 1, 10);
    exitLight.position.copy(exitMarker.position);
    exitLight.position.y += 1;
    scene.add(exitLight);
  };

  const updateMovement = () => {
    if (!cameraRef.current || !mazeRef.current || isRespawning) return;

    const camera = cameraRef.current;
    const velocity = new THREE.Vector3();

    if (moveStateRef.current.forward) velocity.z -= MOVE_SPEED;
    if (moveStateRef.current.backward) velocity.z += MOVE_SPEED;
    if (moveStateRef.current.left) velocity.x -= MOVE_SPEED;
    if (moveStateRef.current.right) velocity.x += MOVE_SPEED;

    velocity.applyQuaternion(camera.quaternion);
    velocity.y = 0;

    const newPosition = camera.position.clone().add(velocity);
    
    if (!checkCollision(newPosition)) {
      camera.position.add(velocity);
      
      playerPositionRef.current = {
        x: Math.round((camera.position.x + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE),
        z: Math.round((camera.position.z + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE)
      };
    }
  };

  const checkCollision = (position: THREE.Vector3): boolean => {
    const mazeX = Math.round((position.x + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE);
    const mazeZ = Math.round((position.z + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE);

    if (mazeX < 0 || mazeX >= MAZE_SIZE || mazeZ < 0 || mazeZ >= MAZE_SIZE) {
      return true;
    }

    const buffer = 0.3;
    const checkPositions = [
      { x: mazeX, z: mazeZ },
      { x: Math.floor((position.x + buffer + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE), z: mazeZ },
      { x: Math.ceil((position.x - buffer + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE), z: mazeZ },
      { x: mazeX, z: Math.floor((position.z + buffer + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE) },
      { x: mazeX, z: Math.ceil((position.z - buffer + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE) }
    ];

    for (const checkPos of checkPositions) {
      if (checkPos.x >= 0 && checkPos.x < MAZE_SIZE && checkPos.z >= 0 && checkPos.z < MAZE_SIZE) {
        if (mazeRef.current[checkPos.z][checkPos.x] === 1) {
          return true;
        }
      }
    }

    return false;
  };

  const checkWinCondition = () => {
    const playerPos = playerPositionRef.current;
    const exitPos = exitPositionRef.current;
    
    const distance = Math.sqrt(
      Math.pow(playerPos.x - exitPos.x, 2) + 
      Math.pow(playerPos.z - exitPos.z, 2)
    );

    if (distance < 1.5 && !gameWon) {
      setGameWon(true);
      toast.success("Congratulations! You've escaped the maze!");
    }
  };

  const startGame = () => {
    if (controlsRef.current) {
      controlsRef.current.lock();
    }
  };

  const resetGame = () => {
    setGameWon(false);
    setGameOver(false);
    setLives(3);
    setCurrentCheckpoint({ x: 1, z: 1 });
    setIsRespawning(false);
    
    if (cameraRef.current) {
      cameraRef.current.position.set(WALL_SIZE, 1.6, WALL_SIZE);
      playerPositionRef.current = { x: 1, z: 1 };
    }
    
    // Reset checkpoints
    checkpointsRef.current.forEach(checkpoint => {
      checkpoint.activated = false;
      checkpoint.mesh.material = new THREE.MeshLambertMaterial({ 
        color: 0x00ff00,
        emissive: 0x004400
      });
    });
    
    toast.success("Game reset! Good luck surviving the maze!");
  };

  const handleGraphicsChange = (quality: GraphicsQuality) => {
    setGraphicsQuality(quality);
    toast.success(`Graphics quality set to ${quality}`);
  };

  const handleTimeChange = (time: TimeOfDay) => {
    setTimeOfDay(time);
    toast.success(`Time set to ${time}`);
  };

  const handleWeatherChange = (weatherType: WeatherType) => {
    setWeather(weatherType);
    toast.success(`Weather set to ${weatherType}`);
  };

  const getWeatherIcon = (weatherType: WeatherType) => {
    switch (weatherType) {
      case 'sunny': return <Sun size={16} />;
      case 'cloudy': return <Cloud size={16} />;
      case 'rainy': return <CloudRain size={16} />;
      case 'snowy': return <CloudSnow size={16} />;
    }
  };

  return (
    <div className="relative w-full h-screen">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* Lives Display */}
      {isLocked && !gameWon && !gameOver && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-3 rounded">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="text-red-500" size={20} />
            <span className="font-bold">Lives: {lives}</span>
          </div>
          <p>Find the red exit marker!</p>
          <p className="text-sm">Press ESC to unlock mouse</p>
          <div className="text-xs mt-1 space-y-1">
            <p>Quality: {graphicsQuality}</p>
            <div className="flex items-center gap-1">
              <span>Time: {timeOfDay}</span>
            </div>
            <div className="flex items-center gap-1">
              {getWeatherIcon(weather)}
              <span>Weather: {weather}</span>
            </div>
          </div>
          {isRespawning && (
            <div className="mt-2 text-yellow-300 text-sm">
              Respawning...
            </div>
          )}
        </div>
      )}

      {/* Settings Button */}
      {isLocked && !gameWon && !gameOver && (
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="absolute top-4 right-4 bg-black bg-opacity-50 text-white p-2 rounded hover:bg-opacity-70"
        >
          <Settings size={20} />
        </button>
      )}

      {/* Settings Panel */}
      {showSettings && isLocked && !gameWon && !gameOver && (
        <div className="absolute top-16 right-4 bg-black bg-opacity-80 text-white p-4 rounded">
          <h3 className="text-lg font-bold mb-3">Game Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm block mb-1">Graphics Quality:</label>
              <Select value={graphicsQuality} onValueChange={handleGraphicsChange}>
                <SelectTrigger className="w-36 bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm block mb-1">Time of Day:</label>
              <Select value={timeOfDay} onValueChange={handleTimeChange}>
                <SelectTrigger className="w-36 bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                  <SelectItem value="sunset">Sunset</SelectItem>
                  <SelectItem value="dawn">Dawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm block mb-1">Weather:</label>
              <Select value={weather} onValueChange={handleWeatherChange}>
                <SelectTrigger className="w-36 bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sunny">
                    <div className="flex items-center gap-2">
                      <Sun size={16} />
                      Sunny
                    </div>
                  </SelectItem>
                  <SelectItem value="cloudy">
                    <div className="flex items-center gap-2">
                      <Cloud size={16} />
                      Cloudy
                    </div>
                  </SelectItem>
                  <SelectItem value="rainy">
                    <div className="flex items-center gap-2">
                      <CloudRain size={16} />
                      Rainy
                    </div>
                  </SelectItem>
                  <SelectItem value="snowy">
                    <div className="flex items-center gap-2">
                      <CloudSnow size={16} />
                      Snowy
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {!isLocked && !gameWon && !gameOver && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg text-center max-w-md">
            <h2 className="text-2xl font-bold mb-4">3D Maze Survival Game</h2>
            <p className="mb-4">Navigate through the maze, avoid enemies, and reach the red exit marker!</p>
            <p className="mb-4 text-sm text-gray-600">
              Use WASD or arrow keys to move, mouse to look around. Find green checkpoints to save your progress!
            </p>
            <div className="mb-4 flex items-center justify-center gap-2">
              <Heart className="text-red-500" size={20} />
              <span className="font-bold">3 Lives</span>
            </div>
            <div className="mb-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Graphics Quality:</label>
                <Select value={graphicsQuality} onValueChange={handleGraphicsChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (Best Performance)</SelectItem>
                    <SelectItem value="medium">Medium (Balanced)</SelectItem>
                    <SelectItem value="high">High (Best Quality)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Time of Day:</label>
                <Select value={timeOfDay} onValueChange={handleTimeChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                    <SelectItem value="sunset">Sunset</SelectItem>
                    <SelectItem value="dawn">Dawn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Weather:</label>
                <Select value={weather} onValueChange={handleWeatherChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sunny">
                      <div className="flex items-center gap-2">
                        <Sun size={16} />
                        Sunny
                      </div>
                    </SelectItem>
                    <SelectItem value="cloudy">
                      <div className="flex items-center gap-2">
                        <Cloud size={16} />
                        Cloudy
                      </div>
                    </SelectItem>
                    <SelectItem value="rainy">
                      <div className="flex items-center gap-2">
                        <CloudRain size={16} />
                        Rainy
                      </div>
                    </SelectItem>
                    <SelectItem value="snowy">
                      <div className="flex items-center gap-2">
                        <CloudSnow size={16} />
                        Snowy
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <button
              onClick={startGame}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold"
            >
              Start Survival Game
            </button>
          </div>
        </div>
      )}

      {gameWon && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg text-center">
            <h2 className="text-3xl font-bold mb-4 text-green-600">You Won!</h2>
            <p className="mb-6">Congratulations on surviving the maze and reaching the exit!</p>
            <button
              onClick={resetGame}
              className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg text-center">
            <h2 className="text-3xl font-bold mb-4 text-red-600">Game Over!</h2>
            <p className="mb-6">You ran out of lives! The enemies were too strong this time.</p>
            <button
              onClick={resetGame}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-semibold"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Fixed PointerLockControls implementation that properly extends EventDispatcher
class PointerLockControls extends THREE.EventDispatcher {
  camera: THREE.Camera;
  domElement: HTMLElement;
  isLocked: boolean = false;
  euler = new THREE.Euler(0, 0, 0, 'YXZ');
  vec = new THREE.Vector3();
  minPolarAngle = 0;
  maxPolarAngle = Math.PI;

  constructor(camera: THREE.Camera, domElement: HTMLElement) {
    super();
    this.camera = camera;
    this.domElement = domElement;

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onPointerlockChange = this.onPointerlockChange.bind(this);
    this.onPointerlockError = this.onPointerlockError.bind(this);

    this.connect();
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isLocked) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= movementX * 0.002;
    this.euler.x -= movementY * 0.002;
    this.euler.x = Math.max(Math.PI / 2 - this.maxPolarAngle, Math.min(Math.PI / 2 - this.minPolarAngle, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
  }

  onPointerlockChange() {
    if (this.domElement.ownerDocument.pointerLockElement === this.domElement) {
      this.dispatchEvent({ type: 'lock' });
      this.isLocked = true;
    } else {
      this.dispatchEvent({ type: 'unlock' });
      this.isLocked = false;
    }
  }

  onPointerlockError() {
    console.error('Unable to use Pointer Lock API');
  }

  connect() {
    this.domElement.ownerDocument.addEventListener('mousemove', this.onMouseMove);
    this.domElement.ownerDocument.addEventListener('pointerlockchange', this.onPointerlockChange);
    this.domElement.ownerDocument.addEventListener('pointerlockerror', this.onPointerlockError);
  }

  disconnect() {
    this.domElement.ownerDocument.removeEventListener('mousemove', this.onMouseMove);
    this.domElement.ownerDocument.removeEventListener('pointerlockchange', this.onPointerlockChange);
    this.domElement.ownerDocument.removeEventListener('pointerlockerror', this.onPointerlockError);
  }

  lock() {
    this.domElement.requestPointerLock();
  }

  unlock() {
    this.domElement.ownerDocument.exitPointerLock();
  }
}

export default MazeGame;
