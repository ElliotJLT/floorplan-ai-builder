import type {
  FloorplanData,
  Room,
  ParsedRoomData,
  AIFloorplanResponse,
  AdjacencyRelation,
  EdgeDirection
} from '@/types/floorplan';

const WALL_THICKNESS = 0.1; // meters

/**
 * Main layout algorithm - uses BFS with adjacency data if available
 */
export function calculateConnectedLayout(aiResponse: AIFloorplanResponse): FloorplanData {
  // If we have adjacency data, use BFS layout algorithm
  if (aiResponse.adjacency && aiResponse.adjacency.length > 0) {
    console.log('Using BFS layout with adjacency data');
    return arrangeWithBFS(aiResponse);
  }

  // Fallback to grid-based layout
  console.log('Using intelligent clustering layout (no adjacency data)');
  return arrangeInGrid(aiResponse);
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
 * BFS-based layout algorithm using adjacency data
 * Positions rooms based on their spatial relationships
 */
function arrangeWithBFS(aiResponse: AIFloorplanResponse): FloorplanData {
  const { rooms, adjacency, ceilingHeight, entryRoomId } = aiResponse;

  if (!adjacency || adjacency.length === 0) {
    console.warn('No adjacency data, falling back to grid layout');
    return arrangeInGrid(aiResponse);
  }

  // Build adjacency graph
  const adjacencyMap = new Map<string, Array<{ roomId: string; edge: EdgeDirection }>>();

  for (const adj of adjacency) {
    // Add forward edge (room1 -> room2)
    if (!adjacencyMap.has(adj.room1)) {
      adjacencyMap.set(adj.room1, []);
    }
    adjacencyMap.get(adj.room1)!.push({
      roomId: adj.room2,
      edge: adj.edge
    });

    // Add reverse edge (room2 -> room1)
    if (!adjacencyMap.has(adj.room2)) {
      adjacencyMap.set(adj.room2, []);
    }
    const reverseEdge = getOppositeEdge(adj.edge);
    adjacencyMap.get(adj.room2)!.push({
      roomId: adj.room1,
      edge: reverseEdge
    });
  }

  // BFS to position rooms
  const positioned = new Map<string, Room>();
  const queue: string[] = [];

  // Start with entry room or first room
  const startRoomId = entryRoomId || rooms[0].id;
  const startRoom = rooms.find(r => r.id === startRoomId);

  if (!startRoom) {
    console.error('Start room not found, falling back to grid layout');
    return arrangeInGrid(aiResponse);
  }

  // Position start room at origin
  positioned.set(startRoom.id, {
    id: startRoom.id,
    name: startRoom.name,
    position: [0, 0, 0],
    dimensions: [startRoom.width, ceilingHeight, startRoom.depth],
    color: startRoom.color,
    originalMeasurements: startRoom.originalMeasurements
  });

  queue.push(startRoom.id);

  // BFS traversal
  while (queue.length > 0) {
    const currentRoomId = queue.shift()!;
    const currentRoom = positioned.get(currentRoomId)!;
    const neighbors = adjacencyMap.get(currentRoomId) || [];

    for (const neighbor of neighbors) {
      // Skip if already positioned
      if (positioned.has(neighbor.roomId)) continue;

      const neighborData = rooms.find(r => r.id === neighbor.roomId);
      if (!neighborData) continue;

      // Calculate position based on edge direction
      const newPosition = calculateAdjacentPosition(
        currentRoom,
        [neighborData.width, ceilingHeight, neighborData.depth],
        neighbor.edge
      );

      // Create positioned room
      positioned.set(neighbor.roomId, {
        id: neighborData.id,
        name: neighborData.name,
        position: newPosition,
        dimensions: [neighborData.width, ceilingHeight, neighborData.depth],
        color: neighborData.color,
        originalMeasurements: neighborData.originalMeasurements
      });

      queue.push(neighbor.roomId);
    }
  }

  // Handle any unconnected rooms (place them in a row at the bottom)
  let offsetX = 0;
  const unconnectedZ = -10; // Place disconnected rooms far down

  for (const room of rooms) {
    if (!positioned.has(room.id)) {
      console.warn(`Room ${room.id} not connected in adjacency graph, placing separately`);

      positioned.set(room.id, {
        id: room.id,
        name: room.name,
        position: [offsetX + room.width / 2, 0, unconnectedZ],
        dimensions: [room.width, ceilingHeight, room.depth],
        color: room.color,
        originalMeasurements: room.originalMeasurements
      });

      offsetX += room.width + WALL_THICKNESS;
    }
  }

  const finalRooms = Array.from(positioned.values());

  console.log(`BFS layout positioned ${finalRooms.length} rooms using ${adjacency.length} adjacencies`);

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
 * Get the opposite edge direction
 */
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
 * Calculate position for adjacent room based on edge direction
 */
function calculateAdjacentPosition(
  baseRoom: Room,
  newDimensions: [number, number, number],
  edge: EdgeDirection
): [number, number, number] {
  const [baseX, baseY, baseZ] = baseRoom.position;
  const [baseWidth, , baseDepth] = baseRoom.dimensions;
  const [newWidth, , newDepth] = newDimensions;

  let x = baseX;
  let z = baseZ;

  switch (edge) {
    case 'north': // +Z direction
      x = baseX;
      z = baseZ + (baseDepth / 2) + (newDepth / 2) + WALL_THICKNESS;
      break;
    case 'south': // -Z direction
      x = baseX;
      z = baseZ - (baseDepth / 2) - (newDepth / 2) - WALL_THICKNESS;
      break;
    case 'east': // +X direction
      x = baseX + (baseWidth / 2) + (newWidth / 2) + WALL_THICKNESS;
      z = baseZ;
      break;
    case 'west': // -X direction
      x = baseX - (baseWidth / 2) - (newWidth / 2) - WALL_THICKNESS;
      z = baseZ;
      break;
  }

  return [x, 0, z];
}

/**
 * Intelligent layout algorithm for UK flats
 * Places rooms based on type clustering and size hints
 */
function arrangeInGrid(aiResponse: AIFloorplanResponse): FloorplanData {
  const { rooms, ceilingHeight, entryRoomId } = aiResponse;
  
  // Categorize rooms by type
  const entryRoom = rooms.find(r => r.id === entryRoomId);
  const receptionRooms = rooms.filter(r => 
    r.name.toLowerCase().includes('reception') || 
    r.name.toLowerCase().includes('living') ||
    r.name.toLowerCase().includes('lounge')
  );
  const bedrooms = rooms.filter(r => r.name.toLowerCase().includes('bedroom'));
  const bathrooms = rooms.filter(r => 
    r.name.toLowerCase().includes('bathroom') || 
    r.name.toLowerCase().includes('wc')
  );
  const kitchen = rooms.find(r => r.name.toLowerCase().includes('kitchen'));
  const hallways = rooms.filter(r => 
    r.name.toLowerCase().includes('hall') && 
    r.id !== entryRoomId
  );
  
  // Remaining rooms
  const categorized = new Set([
    entryRoomId,
    ...receptionRooms.map(r => r.id),
    ...bedrooms.map(r => r.id),
    ...bathrooms.map(r => r.id),
    ...(kitchen ? [kitchen.id] : []),
    ...hallways.map(r => r.id)
  ]);
  const otherRooms = rooms.filter(r => !categorized.has(r.id));
  
  const finalRooms: Room[] = [];
  let currentX = 0;
  let currentZ = 0;
  let maxRowHeight = 0;
  
  // Helper to place a room
  const placeRoom = (room: ParsedRoomData) => {
    finalRooms.push({
      id: room.id,
      name: room.name,
      position: [currentX + room.width / 2, 0, currentZ + room.depth / 2],
      dimensions: [room.width, ceilingHeight, room.depth],
      color: room.color,
      originalMeasurements: room.originalMeasurements
    });
    
    currentX += room.width + WALL_THICKNESS;
    maxRowHeight = Math.max(maxRowHeight, room.depth);
  };
  
  const nextRow = () => {
    currentX = 0;
    currentZ += maxRowHeight + WALL_THICKNESS;
    maxRowHeight = 0;
  };
  
  // Layout strategy: Entry → Reception → Kitchen | Bedrooms → Bathrooms
  
  // Row 1: Entry + Reception rooms (front of flat)
  if (entryRoom) placeRoom(entryRoom);
  receptionRooms.forEach(placeRoom);
  if (receptionRooms.length === 0 && kitchen) placeRoom(kitchen);
  
  // Row 2: Kitchen (if not placed) + Bedrooms
  nextRow();
  if (receptionRooms.length > 0 && kitchen) placeRoom(kitchen);
  bedrooms.slice(0, 2).forEach(placeRoom);
  
  // Row 3: More bedrooms + Bathrooms
  if (bedrooms.length > 2) {
    nextRow();
    bedrooms.slice(2).forEach(placeRoom);
    bathrooms.forEach(placeRoom);
  } else if (bathrooms.length > 0) {
    bathrooms.forEach(placeRoom);
  }
  
  // Row 4: Hallways and other rooms
  if (hallways.length > 0 || otherRooms.length > 0) {
    nextRow();
    hallways.forEach(placeRoom);
    otherRooms.forEach(placeRoom);
  }
  
  return {
    id: aiResponse.id,
    address: aiResponse.address,
    totalAreaSqFt: aiResponse.totalAreaSqFt,
    totalAreaSqM: aiResponse.totalAreaSqM,
    ceilingHeight: aiResponse.ceilingHeight,
    rooms: finalRooms
  };
}
