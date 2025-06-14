import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MazeGenerator } from '../utils/mazeGenerator';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Settings } from 'lucide-react';

interface Position {
  x: number;
  z: number;
}

type GraphicsQuality = 'low' | 'medium' | 'high';

const MazeGame: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [gameWon, setGameWon] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>('low');
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
          enableEdgeSmoothing: false
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
          enableEdgeSmoothing: true
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
          enableEdgeSmoothing: true
        };
    }
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const settings = getGraphicsSettings(graphicsQuality);

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, settings.fogFar);
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

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, settings.ambientIntensity);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, settings.directionalIntensity);
    directionalLight.position.set(10, 10, 5);
    if (settings.enableShadows) {
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = settings.shadowMapSize;
      directionalLight.shadow.mapSize.height = settings.shadowMapSize;
    }
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
    createMaze(scene, maze, settings);

    // Create exit marker
    createExitMarker(scene, settings);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(MAZE_SIZE * WALL_SIZE, MAZE_SIZE * WALL_SIZE);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x90EE90 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    if (settings.enableShadows) {
      ground.receiveShadow = true;
    }
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
    const onLock = () => setIsLocked(true);
    const onUnlock = () => setIsLocked(false);
    
    controls.addEventListener('lock', onLock);
    controls.addEventListener('unlock', onUnlock);

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
      window.addEventListener('resize', onResize);
      
      controls.removeEventListener('lock', onLock);
      controls.removeEventListener('unlock', onUnlock);
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [graphicsQuality]);

  const createMaze = (scene: THREE.Scene, maze: number[][], settings: any) => {
    // Create enhanced wall geometry for better quality
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

    // Add edge enhancement for medium/high quality
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
      // Standard walls for low quality
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
    
    // Create enhanced brick pattern for higher quality
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, 0, size, size);
    
    if (settings.enableEdgeSmoothing) {
      // Add more detailed brick pattern
      ctx.fillStyle = '#A0522D';
      for (let y = 0; y < size; y += size / 8) {
        for (let x = 0; x < size; x += size / 4) {
          const offset = (Math.floor(y / (size / 8)) % 2) * (size / 8);
          ctx.fillRect(x + offset, y, size / 4 - 2, size / 8 - 2);
        }
      }
      
      // Add mortar lines
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 1;
      for (let y = 0; y < size; y += size / 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
    } else {
      // Simple brick pattern for low quality
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

  const handleGraphicsChange = (quality: GraphicsQuality) => {
    setGraphicsQuality(quality);
    toast.success(`Graphics quality set to ${quality}`);
  };

  return (
    <div className="relative w-full h-screen">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* Settings Button */}
      {isLocked && !gameWon && (
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="absolute top-4 right-4 bg-black bg-opacity-50 text-white p-2 rounded hover:bg-opacity-70"
        >
          <Settings size={20} />
        </button>
      )}

      {/* Settings Panel */}
      {showSettings && isLocked && !gameWon && (
        <div className="absolute top-16 right-4 bg-black bg-opacity-80 text-white p-4 rounded">
          <h3 className="text-lg font-bold mb-3">Graphics Settings</h3>
          <div className="space-y-2">
            <label className="text-sm">Quality:</label>
            <Select value={graphicsQuality} onValueChange={handleGraphicsChange}>
              <SelectTrigger className="w-32 bg-gray-700 border-gray-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {!isLocked && !gameWon && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg text-center max-w-md">
            <h2 className="text-2xl font-bold mb-4">3D Maze Game</h2>
            <p className="mb-4">Navigate through the maze to reach the red exit marker!</p>
            <p className="mb-4 text-sm text-gray-600">
              Use WASD or arrow keys to move, mouse to look around
            </p>
            <div className="mb-6">
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
          <p className="text-xs mt-1">Quality: {graphicsQuality}</p>
        </div>
      )}
    </div>
  );
};

// Fixed PointerLockControls implementation
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
