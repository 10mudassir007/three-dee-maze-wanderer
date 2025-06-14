
export class MazeGenerator {
  private width: number;
  private height: number;
  private maze: number[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.maze = [];
  }

  generate(): number[][] {
    // Initialize maze with walls
    this.maze = Array(this.height).fill(null).map(() => Array(this.width).fill(1));

    // Start carving from position (1, 1)
    this.carvePath(1, 1);

    // Ensure there's always a path to the exit area
    this.ensureExitPath();

    return this.maze;
  }

  private carvePath(x: number, y: number): void {
    // Mark current cell as path
    this.maze[y][x] = 0;

    // Get random directions
    const directions = [
      [0, -2], // North
      [2, 0],  // East
      [0, 2],  // South
      [-2, 0]  // West
    ];

    // Shuffle directions
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }

    // Try each direction
    for (const [dx, dy] of directions) {
      const newX = x + dx;
      const newY = y + dy;

      // Check if new position is valid and unvisited
      if (this.isValidCell(newX, newY) && this.maze[newY][newX] === 1) {
        // Carve wall between current and new cell
        this.maze[y + dy / 2][x + dx / 2] = 0;
        
        // Recursively carve from new cell
        this.carvePath(newX, newY);
      }
    }
  }

  private isValidCell(x: number, y: number): boolean {
    return x > 0 && x < this.width - 1 && y > 0 && y < this.height - 1;
  }

  private ensureExitPath(): void {
    // Make sure there's a clear path to the bottom-right area
    const exitX = this.width - 2;
    const exitY = this.height - 2;

    // Simple path carving to exit
    let currentX = 1;
    let currentY = 1;

    while (currentX < exitX || currentY < exitY) {
      this.maze[currentY][currentX] = 0;

      if (currentX < exitX && Math.random() > 0.3) {
        currentX++;
      } else if (currentY < exitY) {
        currentY++;
      } else if (currentX < exitX) {
        currentX++;
      }
    }

    // Ensure exit cell is clear
    this.maze[exitY][exitX] = 0;
  }
}
