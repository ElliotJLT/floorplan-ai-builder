import type {
  FloorplanData,
  Room,
  ParsedRoomData,
  AIFloorplanResponse,
  AdjacencyRelation,
  EdgeDirection,
  UnifiedRoomData
} from '@/types/floorplan';

const WALL_THICKNESS = 0.1; // meters

// ============================================================================
// Image-Based Positioning Functions
// ============================================================================

/**
 * Calculate the scale factor (pixels per meter) from a room's dimensions
 * Uses both width and depth to get average scale
 */
function calculateScale(room: UnifiedRoomData): number | null {
  if (!room.bbox || !room.width || !room.depth) {
    return null;
  }

  // Calculate pixels per meter for both dimensions
  const pixelsPerMeterWidth = room.bbox.width / room.width;
  const pixelsPerMeterDepth = room.bbox.height / room.depth;

  // Average the two to handle any slight distortions
  const avgScale = (pixelsPerMeterWidth + pixelsPerMeterDepth) / 2;

  // Sanity check: scale should be reasonable (typical: 20-200 pixels per meter)
  if (avgScale < 5 || avgScale > 500) {
    console.warn(`Unusual scale detected: ${avgScale} pixels/meter for room ${room.id}`);
    return null;
  }

  return avgScale;
}

/**
 * Calculate global scale factor from all rooms
 * Returns median scale to be robust against outliers
 */
function calculateGlobalScale(rooms: UnifiedRoomData[]): number | null {
  const scales: number[] = [];

  for (const room of rooms) {
    const scale = calculateScale(room);
    if (scale !== null) {
      scales.push(scale);
    }
  }

  if (scales.length === 0) {
    return null;
  }

  // Use median for robustness
  scales.sort((a, b) => a - b);
  const mid = Math.floor(scales.length / 2);
  const medianScale = scales.length % 2 === 0
    ? (scales[mid - 1] + scales[mid]) / 2
    : scales[mid];

  console.log(`Global scale calibration: ${medianScale.toFixed(2)} pixels/meter (from ${scales.length} rooms)`);
  return medianScale;
}

/**
 * Convert pixel coordinates to 3D world coordinates
 * Image origin (0,0) is top-left
 * World origin is center of floorplan
 */
function pixelToWorld(
  pixelPos: { x: number; y: number },
  scale: number,
  imageOrigin: { x: number; y: number }
): [number, number, number] {
  // Convert from image space to world space
  // X-axis: image x → world x (right is positive)
  // Z-axis: image y → world z (down is negative, since image Y increases downward)

  const worldX = (pixelPos.x - imageOrigin.x) / scale;
  const worldZ = (pixelPos.y - imageOrigin.y) / scale;

  return [worldX, 0, worldZ];
}

/**
 * Find the image origin (center point) from room centroids
 * This centers the floorplan around (0, 0) in world space
 */
function calculateImageOrigin(rooms: UnifiedRoomData[]): { x: number; y: number } {
  const validRooms = rooms.filter(r => r.centroid);

  if (validRooms.length === 0) {
    return { x: 0, y: 0 };
  }

  const sumX = validRooms.reduce((sum, r) => sum + r.centroid.x, 0);
  const sumY = validRooms.reduce((sum, r) => sum + r.centroid.y, 0);

  return {
    x: sumX / validRooms.length,
    y: sumY / validRooms.length
  };
}

/**
 * Image-based layout algorithm using actual pixel positions from CV
 * This is the primary method - most accurate as it preserves real floorplan layout
 */
function arrangeFromImagePositions(aiResponse: AIFloorplanResponse): FloorplanData | null {
  const { rooms, ceilingHeight } = aiResponse;

  // Check if we have pixel data for all rooms
  const roomsWithPixelData = rooms.filter(r => r.centroid && r.bbox);

  if (roomsWithPixelData.length < rooms.length * 0.5) {
    console.log(`Only ${roomsWithPixelData.length}/${rooms.length} rooms have pixel data, falling back`);
    return null;
  }

  // Calculate global scale factor
  const scale = calculateGlobalScale(roomsWithPixelData);
  if (!scale) {
    console.log('Could not calculate scale, falling back');
    return null;
  }

  // Calculate image origin (center point)
  const imageOrigin = calculateImageOrigin(roomsWithPixelData);
  console.log(`Image origin: (${imageOrigin.x.toFixed(1)}, ${imageOrigin.y.toFixed(1)}) pixels`);

  // Position each room using its pixel centroid
  const finalRooms: Room[] = [];

  for (const room of rooms) {
    if (!room.centroid) {
      console.warn(`Room ${room.id} missing centroid, placing at origin`);
      finalRooms.push({
        id: room.id,
        name: room.name,
        position: [0, 0, 0],
        dimensions: [room.width, ceilingHeight, room.depth],
        color: room.color,
        originalMeasurements: room.originalMeasurements
      });
      continue;
    }

    // Convert pixel position to world coordinates
    const position = pixelToWorld(room.centroid, scale, imageOrigin);

    finalRooms.push({
      id: room.id,
      name: room.name,
      position: position,
      dimensions: [room.width, ceilingHeight, room.depth],
      color: room.color,
      originalMeasurements: room.originalMeasurements
    });
  }

  console.log(`Image-based layout positioned ${finalRooms.length} rooms using pixel coordinates`);
  console.log(`Scale: ${scale.toFixed(2)} pixels/meter`);

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
 * Main layout algorithm - tries multiple strategies in order of accuracy:
 * 1. Image-based positioning (most accurate - uses actual pixel positions)
 * 2. BFS with adjacency (accurate topology but calculated positions)
 * 3. Grid layout with UK conventions (fallback)
 */
export function calculateConnectedLayout(aiResponse: AIFloorplanResponse): FloorplanData {
  // Check if synthetic contours were used - if so, skip image-based positioning
  if (aiResponse.metadata?.usedSyntheticContours) {
    console.log('⚠ Synthetic contours detected - skipping image-based positioning');
    console.log('  (Synthetic contours have fake pixel data that does not match the real floorplan)');

    // If we have adjacency data, use BFS layout algorithm
    if (aiResponse.adjacency && aiResponse.adjacency.length > 0) {
      console.log('✓ Using BFS layout with adjacency data');
      return arrangeWithBFS(aiResponse);
    }

    // Fallback to grid-based layout
    console.log('✓ Using intelligent grid layout (no adjacency data)');
    return arrangeInGrid(aiResponse);
  }

  // Try image-based positioning first (most accurate) - only when we have real CV data
  const imageBasedLayout = arrangeFromImagePositions(aiResponse);
  if (imageBasedLayout) {
    console.log('✓ Using image-based positioning (preserves actual floorplan layout)');
    return imageBasedLayout;
  }

  // If we have adjacency data, use BFS layout algorithm
  if (aiResponse.adjacency && aiResponse.adjacency.length > 0) {
    console.log('✓ Using BFS layout with adjacency data');
    return arrangeWithBFS(aiResponse);
  }

  // Fallback to grid-based layout
  console.log('✓ Using intelligent grid layout (no adjacency data)');
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
 * Creates realistic, compact layouts based on room types and adjacency patterns
 */
function arrangeInGrid(aiResponse: AIFloorplanResponse): FloorplanData {
  const { rooms, ceilingHeight, entryRoomId, totalAreaSqM } = aiResponse;

  console.log(`Creating intelligent grid layout for ${rooms.length} rooms (target area: ${totalAreaSqM}m²)`);

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
  const placedIds = new Set<string>();

  // Calculate total room area and compare to target
  const calculatedArea = rooms.reduce((sum, r) => sum + (r.width * r.depth), 0);
  const areaRatio = calculatedArea / totalAreaSqM;

  if (areaRatio > 1.1) {
    console.warn(`Calculated room area (${calculatedArea.toFixed(2)}m²) exceeds target (${totalAreaSqM}m²) by ${((areaRatio - 1) * 100).toFixed(1)}%`);
  }

  // Calculate optimal layout width (aim for roughly rectangular overall shape)
  const targetRatio = 1.5; // Width:Depth ratio for typical flat
  const optimalWidth = Math.sqrt(totalAreaSqM * targetRatio);

  let currentX = 0;
  let currentZ = 0;
  let maxRowHeight = 0;
  let currentRowWidth = 0;

  // Helper to place a room with improved positioning
  const placeRoom = (room: ParsedRoomData, forceNewRow: boolean = false) => {
    // Skip if this room was already placed via another category (e.g., "Kitchen/Living Room")
    if (placedIds.has(room.id)) {
      console.warn(`Skipping duplicate placement for room id="${room.id}" (${room.name})`);
      return;
    }

    // Check if we should start a new row
    if (forceNewRow || (currentRowWidth + room.width > optimalWidth && finalRooms.length > 0)) {
      currentX = 0;
      currentZ += maxRowHeight + WALL_THICKNESS;
      maxRowHeight = 0;
      currentRowWidth = 0;
    }

    finalRooms.push({
      id: room.id,
      name: room.name,
      position: [currentX + room.width / 2, 0, currentZ + room.depth / 2],
      dimensions: [room.width, ceilingHeight, room.depth],
      color: room.color,
      originalMeasurements: room.originalMeasurements
    });

    placedIds.add(room.id);

    currentX += room.width + WALL_THICKNESS;
    currentRowWidth += room.width + WALL_THICKNESS;
    maxRowHeight = Math.max(maxRowHeight, room.depth);
  };

  // Enhanced layout strategy following UK flat conventions:
  // 1. Entry/hall at front
  // 2. Living spaces adjacent to entry
  // 3. Kitchen near living spaces
  // 4. Bedrooms in a separate zone
  // 5. Bathrooms near bedrooms

  // Place entry room first
  if (entryRoom) {
    placeRoom(entryRoom);
  }

  // Place reception rooms adjacent to entry (same row if space allows)
  receptionRooms.forEach((room, idx) => {
    placeRoom(room, idx > 0 && receptionRooms[idx - 1].width > optimalWidth * 0.6);
  });

  // Place kitchen on the same row if space allows, or start new row
  if (kitchen) {
    const shouldStartNewRow = currentRowWidth > optimalWidth * 0.7;
    placeRoom(kitchen, shouldStartNewRow);
  }

  // Place hallways to connect spaces
  hallways.forEach((hall, idx) => {
    // Hallways typically run along one edge
    const shouldStartNewRow = idx === 0 && currentRowWidth > optimalWidth * 0.5;
    placeRoom(hall, shouldStartNewRow);
  });

  // Start bedroom zone (force new row for clear separation)
  if (bedrooms.length > 0) {
    bedrooms.forEach((bedroom, idx) => {
      // First bedroom starts new row, others flow naturally
      const shouldStartNewRow = idx === 0;
      placeRoom(bedroom, shouldStartNewRow);
    });
  }

  // Place bathrooms adjacent to bedrooms
  bathrooms.forEach((bathroom, idx) => {
    // Try to keep bathrooms on same row as bedrooms
    const shouldStartNewRow = currentRowWidth > optimalWidth * 0.9;
    placeRoom(bathroom, shouldStartNewRow);
  });

  // Place any remaining rooms
  otherRooms.forEach((room) => {
    placeRoom(room);
  });

  // Calculate layout bounds
  const bounds = finalRooms.reduce((acc, room) => {
    const [x, , z] = room.position;
    const [w, , d] = room.dimensions;
    return {
      minX: Math.min(acc.minX, x - w / 2),
      maxX: Math.max(acc.maxX, x + w / 2),
      minZ: Math.min(acc.minZ, z - d / 2),
      maxZ: Math.max(acc.maxZ, z + d / 2)
    };
  }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  const layoutWidth = bounds.maxX - bounds.minX;
  const layoutDepth = bounds.maxZ - bounds.minZ;
  const actualRatio = layoutWidth / layoutDepth;

  console.log(`Layout complete: ${layoutWidth.toFixed(2)}m × ${layoutDepth.toFixed(2)}m (ratio: ${actualRatio.toFixed(2)})`);
  console.log(`Area utilization: ${((calculatedArea / totalAreaSqM) * 100).toFixed(1)}%`);

  return {
    id: aiResponse.id,
    address: aiResponse.address,
    totalAreaSqFt: aiResponse.totalAreaSqFt,
    totalAreaSqM: aiResponse.totalAreaSqM,
    ceilingHeight: aiResponse.ceilingHeight,
    rooms: finalRooms
  };
}
