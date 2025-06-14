
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MazeGenerator } from '../utils/mazeGenerator';
import { toast } from 'sonner';

interface Position {
  x: number;
  z: number;
}

const MazeGame: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [gameWon, setGameWon] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const mazeRef = useRef<number[][]>([]);
  const wallsRef = useRef<THREE.Mesh[]>([]);
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

  useEffect(() => {
    if (!mountRef.current) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 50);
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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Generate maze
    const mazeGenerator = new MazeGenerator(MAZE_SIZE, MAZE_SIZE);
    const maze = mazeGenerator.generate();
    mazeRef.current = maze;

    // Find exit position (bottom-right area)
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
    createMaze(scene, maze);

    // Create exit marker
    createExitMarker(scene);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(MAZE_SIZE * WALL_SIZE, MAZE_SIZE * WALL_SIZE);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x90EE90 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

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

    // Pointer lock events
    controls.addEventListener('lock', () => setIsLocked(true));
    controls.addEventListener('unlock', () => setIsLocked(false));

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      if (controls.isLocked && !gameWon) {
        updateMovement();
        checkWinCondition();
      }

      renderer.render(scene, camera);
    };
    animate();

    toast.success("Maze loaded! Click to start and use WASD or arrow keys to navigate!");

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  const createMaze = (scene: THREE.Scene, maze: number[][]) => {
    const wallGeometry = new THREE.BoxGeometry(WALL_SIZE, WALL_HEIGHT, WALL_SIZE);
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });

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
          wall.castShadow = true;
          wall.receiveShadow = true;
          scene.add(wall);
          wallsRef.current.push(wall);
        }
      }
    }
  };

  const createExitMarker = (scene: THREE.Scene) => {
    const exitGeometry = new THREE.CylinderGeometry(0.5, 0.5, 4, 8);
    const exitMaterial = new THREE.MeshLambertMaterial({ color: 0xFF6B6B });
    const exitMarker = new THREE.Mesh(exitGeometry, exitMaterial);
    
    exitMarker.position.set(
      (exitPositionRef.current.x - MAZE_SIZE / 2) * WALL_SIZE,
      2,
      (exitPositionRef.current.z - MAZE_SIZE / 2) * WALL_SIZE
    );
    
    scene.add(exitMarker);

    // Add glowing effect
    const exitLight = new THREE.PointLight(0xFF6B6B, 1, 10);
    exitLight.position.copy(exitMarker.position);
    exitLight.position.y += 1;
    scene.add(exitLight);
  };

  const updateMovement = () => {
    if (!cameraRef.current || !mazeRef.current) return;

    const camera = cameraRef.current;
    const velocity = new THREE.Vector3();

    if (moveStateRef.current.forward) velocity.z -= MOVE_SPEED;
    if (moveStateRef.current.backward) velocity.z += MOVE_SPEED;
    if (moveStateRef.current.left) velocity.x -= MOVE_SPEED;
    if (moveStateRef.current.right) velocity.x += MOVE_SPEED;

    // Apply camera rotation to movement
    velocity.applyQuaternion(camera.quaternion);
    velocity.y = 0; // Keep movement horizontal

    // Check collision
    const newPosition = camera.position.clone().add(velocity);
    
    if (!checkCollision(newPosition)) {
      camera.position.add(velocity);
      
      // Update player position for win condition
      playerPositionRef.current = {
        x: Math.round((camera.position.x + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE),
        z: Math.round((camera.position.z + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE)
      };
    }
  };

  const checkCollision = (position: THREE.Vector3): boolean => {
    // Convert world position to maze coordinates
    const mazeX = Math.round((position.x + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE);
    const mazeZ = Math.round((position.z + MAZE_SIZE * WALL_SIZE / 2) / WALL_SIZE);

    // Check bounds
    if (mazeX < 0 || mazeX >= MAZE_SIZE || mazeZ < 0 || mazeZ >= MAZE_SIZE) {
      return true;
    }

    // Check wall collision
    return mazeRef.current[mazeZ][mazeX] === 1;
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
    if (cameraRef.current) {
      cameraRef.current.position.set(WALL_SIZE, 1.6, WALL_SIZE);
      playerPositionRef.current = { x: 1, z: 1 };
    }
    toast.success("Maze reset! Good luck!");
  };

  return (
    <div className="relative w-full h-screen">
      <div ref={mountRef} className="w-full h-full" />
      
      {!isLocked && !gameWon && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg text-center">
            <h2 className="text-2xl font-bold mb-4">3D Maze Game</h2>
            <p className="mb-4">Navigate through the maze to reach the red exit marker!</p>
            <p className="mb-6 text-sm text-gray-600">
              Use WASD or arrow keys to move, mouse to look around
            </p>
            <button
              onClick={startGame}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold"
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      {gameWon && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg text-center">
            <h2 className="text-3xl font-bold mb-4 text-green-600">You Won!</h2>
            <p className="mb-6">Congratulations on escaping the maze!</p>
            <button
              onClick={resetGame}
              className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {isLocked && !gameWon && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-3 rounded">
          <p>Find the red exit marker!</p>
          <p className="text-sm">Press ESC to unlock mouse</p>
        </div>
      )}
    </div>
  );
};

// PointerLockControls implementation
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
