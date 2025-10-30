import type { 
  FloorplanData, 
  Room, 
  ParsedRoomData, 
  AIFloorplanResponse 
} from '@/types/floorplan';

const WALL_THICKNESS = 0.1; // meters

/**
 * Main layout algorithm - uses intelligent clustering
 * No longer relies on adjacency data from AI
 */
export function calculateConnectedLayout(aiResponse: AIFloorplanResponse): FloorplanData {
  console.log('Using intelligent clustering layout (no adjacency required)');
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
