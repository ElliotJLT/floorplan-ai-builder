import { FloorplanData, Room } from "@/types/floorplan";

/**
 * AI Floorplan Parser Interface
 * 
 * This utility provides the structure for how an AI model should
 * parse a floorplan image and convert it to 3D data.
 * 
 * WORKFLOW FOR AI IMPLEMENTATION:
 * 
 * 1. Image Analysis Phase:
 *    - Detect walls, doors, windows
 *    - Identify room labels
 *    - Extract measurement annotations
 *    - Recognize symbols (toilets, kitchens, etc.)
 * 
 * 2. Measurement Extraction:
 *    - Parse dimension text (e.g., "23'6\"", "7.16m")
 *    - Convert to consistent metric units
 *    - Handle different formats (imperial/metric)
 *    - Calculate missing dimensions from scale
 * 
 * 3. Spatial Analysis:
 *    - Determine room adjacency
 *    - Calculate relative positions
 *    - Identify shared walls
 *    - Build connection graph
 * 
 * 4. 3D Coordinate Generation:
 *    - Choose reference point (typically entrance/hall)
 *    - Calculate absolute positions for each room
 *    - Ensure proper alignment
 *    - Validate no overlaps
 * 
 * 5. Output Generation:
 *    - Create FloorplanData structure
 *    - Populate all room data
 *    - Add metadata
 */

/**
 * Converts imperial measurements to metric
 */
export function imperialToMetric(feet: number, inches: number): number {
  return feet * 0.3048 + inches * 0.0254;
}

/**
 * Parses a dimension string like "23'6\"" or "7.16m"
 */
export function parseDimension(dimension: string): number {
  // Metric format (e.g., "7.16m")
  if (dimension.includes('m') && !dimension.includes("'")) {
    return parseFloat(dimension.replace('m', ''));
  }
  
  // Imperial format (e.g., "23'6\"")
  const imperialMatch = dimension.match(/(\d+)'(\d+)"/);
  if (imperialMatch) {
    const feet = parseInt(imperialMatch[1]);
    const inches = parseInt(imperialMatch[2]);
    return imperialToMetric(feet, inches);
  }
  
  // Fallback: just parse as number
  return parseFloat(dimension);
}

/**
 * Validates floorplan data structure
 */
export function validateFloorplanData(data: FloorplanData): boolean {
  // Check required fields
  if (!data.id || !data.address || !data.rooms || data.rooms.length === 0) {
    console.error('Missing required fields in FloorplanData');
    return false;
  }
  
  // Validate each room
  for (const room of data.rooms) {
    if (!room.id || !room.name || !room.position || !room.dimensions) {
      console.error(`Invalid room data for room: ${room.id}`);
      return false;
    }
    
    // Check for valid dimensions
    if (room.dimensions.some(d => d <= 0)) {
      console.error(`Invalid dimensions for room: ${room.id}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Checks if two rooms overlap in 3D space
 */
export function checkRoomOverlap(room1: Room, room2: Room): boolean {
  const [x1, y1, z1] = room1.position;
  const [w1, h1, d1] = room1.dimensions;
  
  const [x2, y2, z2] = room2.position;
  const [w2, h2, d2] = room2.dimensions;
  
  // Calculate bounding boxes
  const r1 = {
    minX: x1 - w1/2,
    maxX: x1 + w1/2,
    minY: y1,
    maxY: y1 + h1,
    minZ: z1 - d1/2,
    maxZ: z1 + d1/2
  };
  
  const r2 = {
    minX: x2 - w2/2,
    maxX: x2 + w2/2,
    minY: y2,
    maxY: y2 + h2,
    minZ: z2 - d2/2,
    maxZ: z2 + d2/2
  };
  
  // Check for overlap
  return !(
    r1.maxX < r2.minX || r1.minX > r2.maxX ||
    r1.maxY < r2.minY || r1.minY > r2.maxY ||
    r1.maxZ < r2.minZ || r1.minZ > r2.maxZ
  );
}

/**
 * Template function for AI to implement
 * This is where the AI model would process the image
 */
export async function parseFloorplanImage(imageData: string): Promise<FloorplanData> {
  // TODO: Implement AI vision model here
  // 
  // Example workflow:
  // 1. Send imageData to vision model
  // 2. Extract room information
  // 3. Parse measurements
  // 4. Calculate positions
  // 5. Return FloorplanData structure
  
  throw new Error('AI parser not yet implemented. This function should be replaced with actual AI model integration.');
  
  // Example expected output structure:
  // return {
  //   id: "generated-id",
  //   address: "Extracted from image",
  //   totalAreaSqFt: 0,
  //   totalAreaSqM: 0,
  //   ceilingHeight: 2.5,
  //   rooms: [
  //     {
  //       id: "room-1",
  //       name: "Living Room",
  //       position: [0, 0, 0],
  //       dimensions: [5, 2.5, 4],
  //       color: "#e8f2f7",
  //       originalMeasurements: {
  //         width: "16'5\"",
  //         depth: "13'1\""
  //       }
  //     }
  //   ]
  // };
}

/**
 * Example: Calculate room position relative to another room
 * AI should use this logic when determining spatial relationships
 */
export function calculateAdjacentRoomPosition(
  baseRoom: Room,
  newRoomDimensions: [number, number, number],
  direction: 'north' | 'south' | 'east' | 'west'
): [number, number, number] {
  const [baseX, baseY, baseZ] = baseRoom.position;
  const [baseWidth, baseHeight, baseDepth] = baseRoom.dimensions;
  const [newWidth, newHeight, newDepth] = newRoomDimensions;
  
  const wallThickness = 0.1; // 10cm wall
  
  switch (direction) {
    case 'north': // +Z direction
      return [
        baseX,
        0,
        baseZ + baseDepth/2 + newDepth/2 + wallThickness
      ];
    case 'south': // -Z direction
      return [
        baseX,
        0,
        baseZ - baseDepth/2 - newDepth/2 - wallThickness
      ];
    case 'east': // +X direction
      return [
        baseX + baseWidth/2 + newWidth/2 + wallThickness,
        0,
        baseZ
      ];
    case 'west': // -X direction
      return [
        baseX - baseWidth/2 - newWidth/2 - wallThickness,
        0,
        baseZ
      ];
  }
}
