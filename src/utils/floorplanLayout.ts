import type { 
  FloorplanData, 
  Room, 
  ParsedRoomData, 
  AdjacencyRelation, 
  EdgeDirection,
  AIFloorplanResponse 
} from '@/types/floorplan';

const WALL_THICKNESS = 0.1; // meters

interface PlacedRoom {
  id: string;
  room: ParsedRoomData;
  position: [number, number, number];
}

/**
 * Deterministic layout algorithm using breadth-first traversal
 * Guarantees adjacent rooms have touching walls
 */
export function calculateConnectedLayout(aiResponse: AIFloorplanResponse): FloorplanData {
  const { rooms, adjacency, entryRoomId, ceilingHeight } = aiResponse;
  
  // Check if adjacency data is valid
  if (!adjacency || adjacency.length === 0) {
    console.warn('No adjacency data provided, using grid fallback layout');
    return arrangeInGrid(aiResponse);
  }
  
  // Build adjacency map for quick lookup
  const adjacencyMap = new Map<string, Array<{ roomId: string; edge: EdgeDirection }>>();
  
  for (const rel of adjacency) {
    if (!adjacencyMap.has(rel.room1)) {
      adjacencyMap.set(rel.room1, []);
    }
    adjacencyMap.get(rel.room1)!.push({ roomId: rel.room2, edge: rel.edge });
    
    // Add reverse relationship
    if (!adjacencyMap.has(rel.room2)) {
      adjacencyMap.set(rel.room2, []);
    }
    adjacencyMap.get(rel.room2)!.push({ roomId: rel.room1, edge: getOppositeEdge(rel.edge) });
  }
  
  // Find entry room
  const entryRoom = rooms.find(r => r.id === entryRoomId);
  if (!entryRoom) {
    throw new Error(`Entry room ${entryRoomId} not found`);
  }
  
  // Place rooms using BFS
  const placedRooms = new Map<string, PlacedRoom>();
  const queue: string[] = [entryRoomId];
  
  // Start with entry room at origin
  placedRooms.set(entryRoomId, {
    id: entryRoomId,
    room: entryRoom,
    position: [0, 0, 0]
  });
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = placedRooms.get(currentId)!;
    const neighbors = adjacencyMap.get(currentId) || [];
    
    for (const { roomId, edge } of neighbors) {
      // Skip if already placed
      if (placedRooms.has(roomId)) continue;
      
      const neighborRoom = rooms.find(r => r.id === roomId);
      if (!neighborRoom) continue;
      
      // Calculate position based on edge direction
      const newPosition = calculateAdjacentPosition(
        current.position,
        current.room,
        neighborRoom,
        edge
      );
      
      placedRooms.set(roomId, {
        id: roomId,
        room: neighborRoom,
        position: newPosition
      });
      
      queue.push(roomId);
    }
  }
  
  // Check if all rooms were placed
  if (placedRooms.size < rooms.length) {
    const unplacedRooms = rooms.filter(r => !placedRooms.has(r.id));
    console.warn('Some rooms could not be placed via adjacency:', unplacedRooms.map(r => r.name));
    console.warn('Falling back to grid layout');
    return arrangeInGrid(aiResponse);
  }
  
  // Convert to FloorplanData
  const finalRooms: Room[] = Array.from(placedRooms.values()).map(placed => ({
    id: placed.room.id,
    name: placed.room.name,
    position: placed.position,
    dimensions: [placed.room.width, ceilingHeight, placed.room.depth],
    color: placed.room.color,
    originalMeasurements: placed.room.originalMeasurements
  }));
  
  return {
    id: aiResponse.id,
    address: aiResponse.address,
    totalAreaSqFt: aiResponse.totalAreaSqFt,
    totalAreaSqM: aiResponse.totalAreaSqM,
    ceilingHeight: aiResponse.ceilingHeight,
    rooms: finalRooms
  };
}

/**
 * Calculate position of a room adjacent to another room
 */
function calculateAdjacentPosition(
  basePosition: [number, number, number],
  baseRoom: ParsedRoomData,
  newRoom: ParsedRoomData,
  edge: EdgeDirection
): [number, number, number] {
  const [baseX, baseY, baseZ] = basePosition;
  
  switch (edge) {
    case 'east': // To the RIGHT (+X)
      return [
        baseX + (baseRoom.width / 2) + WALL_THICKNESS + (newRoom.width / 2),
        0,
        baseZ
      ];
      
    case 'west': // To the LEFT (-X)
      return [
        baseX - (baseRoom.width / 2) - WALL_THICKNESS - (newRoom.width / 2),
        0,
        baseZ
      ];
      
    case 'north': // BEHIND (+Z)
      return [
        baseX,
        0,
        baseZ + (baseRoom.depth / 2) + WALL_THICKNESS + (newRoom.depth / 2)
      ];
      
    case 'south': // IN FRONT (-Z)
      return [
        baseX,
        0,
        baseZ - (baseRoom.depth / 2) - WALL_THICKNESS - (newRoom.depth / 2)
      ];
  }
}

function getOppositeEdge(edge: EdgeDirection): EdgeDirection {
  const opposites: Record<EdgeDirection, EdgeDirection> = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east'
  };
  return opposites[edge];
}

/**
 * Validate layout for overlaps and gaps
 */
export function validateLayout(floorplanData: FloorplanData): {
  isValid: boolean;
  overlaps: Array<{ room1: string; room2: string }>;
  gaps: Array<{ room1: string; room2: string; distance: number }>;
} {
  const overlaps: Array<{ room1: string; room2: string }> = [];
  const gaps: Array<{ room1: string; room2: string; distance: number }> = [];
  
  const rooms = floorplanData.rooms;
  
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const r1 = rooms[i];
      const r2 = rooms[j];
      
      const distance = calculateMinDistance(r1, r2);
      
      if (distance < -0.05) { // Overlapping
        overlaps.push({ room1: r1.id, room2: r2.id });
      } else if (distance > WALL_THICKNESS + 0.05 && distance < 0.5) { // Small gap (potential adjacency)
        gaps.push({ room1: r1.id, room2: r2.id, distance });
      }
    }
  }
  
  return {
    isValid: overlaps.length === 0,
    overlaps,
    gaps
  };
}

function calculateMinDistance(r1: Room, r2: Room): number {
  const [x1, , z1] = r1.position;
  const [w1, , d1] = r1.dimensions;
  const [x2, , z2] = r2.position;
  const [w2, , d2] = r2.dimensions;
  
  // Calculate bounding box edges
  const r1Left = x1 - w1 / 2;
  const r1Right = x1 + w1 / 2;
  const r1Back = z1 - d1 / 2;
  const r1Front = z1 + d1 / 2;
  
  const r2Left = x2 - w2 / 2;
  const r2Right = x2 + w2 / 2;
  const r2Back = z2 - d2 / 2;
  const r2Front = z2 + d2 / 2;
  
  // Calculate overlap on each axis
  const xOverlap = Math.max(0, Math.min(r1Right, r2Right) - Math.max(r1Left, r2Left));
  const zOverlap = Math.max(0, Math.min(r1Front, r2Front) - Math.max(r1Back, r2Back));
  
  // If there's overlap on both axes, rooms are overlapping
  if (xOverlap > 0 && zOverlap > 0) {
    return -Math.min(xOverlap, zOverlap); // Negative indicates overlap
  }
  
  // Calculate minimum distance
  const xDistance = Math.max(0, Math.max(r1Left, r2Left) - Math.min(r1Right, r2Right));
  const zDistance = Math.max(0, Math.max(r1Back, r2Back) - Math.min(r1Front, r2Front));
  
  if (xDistance > 0 && zDistance > 0) {
    return Math.sqrt(xDistance * xDistance + zDistance * zDistance);
  }
  
  return Math.max(xDistance, zDistance);
}

/**
 * Fallback grid layout when adjacency data is missing or incomplete
 * Places rooms in a simple grid pattern based on their size
 */
function arrangeInGrid(aiResponse: AIFloorplanResponse): FloorplanData {
  const { rooms, ceilingHeight } = aiResponse;
  
  // Sort rooms by area (largest first)
  const sortedRooms = [...rooms].sort((a, b) => {
    const areaA = a.width * a.depth;
    const areaB = b.width * b.depth;
    return areaB - areaA;
  });
  
  // Calculate grid dimensions (try to make it roughly square)
  const gridSize = Math.ceil(Math.sqrt(sortedRooms.length));
  
  const finalRooms: Room[] = sortedRooms.map((room, index) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    
    // Calculate position with spacing
    const spacing = 0.5; // meters between rooms
    const x = col * (room.width + spacing);
    const z = row * (room.depth + spacing);
    
    return {
      id: room.id,
      name: room.name,
      position: [x, 0, z] as [number, number, number],
      dimensions: [room.width, ceilingHeight, room.depth] as [number, number, number],
      color: room.color,
      originalMeasurements: room.originalMeasurements
    };
  });
  
  return {
    id: aiResponse.id,
    address: aiResponse.address,
    totalAreaSqFt: aiResponse.totalAreaSqFt,
    totalAreaSqM: aiResponse.totalAreaSqM,
    ceilingHeight: aiResponse.ceilingHeight,
    rooms: finalRooms
  };
}
