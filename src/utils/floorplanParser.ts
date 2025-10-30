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
 * ============================================================================
 * AI IMAGE PARSING FUNCTION - COMPREHENSIVE IMPLEMENTATION GUIDE
 * ============================================================================
 * 
 * This function is the entry point for AI vision models to convert 2D
 * floorplan images into 3D FloorplanData structures. Follow this workflow
 * exactly for consistent, accurate results.
 * 
 * INTEGRATION REQUIREMENTS:
 * -------------------------
 * - Vision AI model with OCR capabilities (e.g., GPT-4 Vision, Claude Vision, Google Vision AI)
 * - Image preprocessing library (optional, for enhancement)
 * - JSON schema validator for output verification
 * 
 * STEP-BY-STEP AI WORKFLOW:
 * ==========================
 * 
 * STEP 1: IMAGE PREPROCESSING (Optional but Recommended)
 * -------------------------------------------------------
 * Before sending to AI model:
 * - Enhance contrast for better text recognition
 * - Deskew if image is rotated
 * - Crop out legends, compass roses, or irrelevant borders
 * - Increase resolution if too low (<300 DPI recommended)
 * 
 * STEP 2: INITIAL IMAGE ANALYSIS
 * -------------------------------
 * AI model should extract:
 * 
 * A. Text Elements (OCR):
 *    - Room names/labels (e.g., "Reception/Dining Room/Kitchen")
 *    - Dimension annotations (e.g., "23'6\" × 10'10\"" or "7.16m × 3.30m")
 *    - Total area (e.g., "556 sq ft / 51.65 sq m")
 *    - Property address (e.g., "Whateley Road, East Dulwich, SE22")
 *    - Ceiling height if noted (e.g., "2.51m ceiling height")
 * 
 * B. Visual Elements (Computer Vision):
 *    - Wall lines (exterior and interior)
 *    - Door openings (look for gaps in walls, arc symbols)
 *    - Window positions (parallel lines or special symbols)
 *    - Room boundaries (enclosed polygons)
 *    - Scale bar (if present, for measurement calibration)
 * 
 * C. Spatial Relationships (Graph Analysis):
 *    - Which rooms share walls (adjacency)
 *    - Which room is the entrance/hall (typically labeled or central)
 *    - Approximate layout orientation (north arrow if present)
 * 
 * STEP 3: MEASUREMENT EXTRACTION & CONVERSION
 * --------------------------------------------
 * For each detected measurement string:
 * 
 * Parse format:
 *   "23'6\"" → parseDimension() → 7.16m
 *   "10'10\"" → parseDimension() → 3.30m
 *   "7.16m" → 7.16m (already metric)
 *   "23'6\" (7.16m)" → prefer 7.16m (metric)
 * 
 * Conversion formulas:
 *   1 foot = 0.3048 meters
 *   1 inch = 0.0254 meters
 *   feet'inches" = (feet × 0.3048) + (inches × 0.0254)
 * 
 * For rooms without dimensions:
 *   - Use scale bar if available
 *   - Estimate from pixel measurements relative to known dimensions
 *   - Use typical sizes: bathroom ~2m×2m, hallway ~2m×2.5m
 * 
 * STEP 4: BUILD ADJACENCY GRAPH
 * ------------------------------
 * Create a graph structure mapping room relationships:
 * 
 * Example structure:
 * {
 *   "entrance-hall": {
 *     north: "principal-bedroom",
 *     south: "bedroom-2",
 *     east: "bathroom",
 *     west: "reception-kitchen"
 *   },
 *   "reception-kitchen": {
 *     east: "entrance-hall",
 *     south: "bedroom-2" (partial overlap)
 *   },
 *   // ... etc
 * }
 * 
 * Algorithm:
 * 1. For each room bounding box A
 * 2. For each other room bounding box B
 * 3. Check if they share a wall:
 *    - Horizontal wall: A.bottom ≈ B.top OR A.top ≈ B.bottom
 *    - Vertical wall: A.left ≈ B.right OR A.right ≈ B.left
 * 4. Determine direction: north/south/east/west
 * 5. Add edge to graph
 * 
 * STEP 5: CALCULATE 3D POSITIONS
 * -------------------------------
 * This is the MOST CRITICAL step. Follow this algorithm exactly:
 * 
 * Algorithm:
 * ----------
 * 1. Identify anchor room (entrance/hall or central room)
 * 2. Set anchor.position = [0, 0, 0]
 * 3. Create positioned_rooms = [anchor]
 * 4. Create pending_rooms = all other rooms
 * 
 * 5. While pending_rooms not empty:
 *    a. For each pending room P:
 *       - Check if adjacent to any room R in positioned_rooms
 *       - If yes:
 *         i.   Get direction from R to P (from adjacency graph)
 *         ii.  Calculate P.position using calculateAdjacentPosition()
 *         iii. Move P from pending_rooms to positioned_rooms
 *       - If no adjacent positioned rooms yet, skip for now
 * 
 * Position Calculation Formula:
 * -----------------------------
 * Given: Room A (positioned), Room B (to be positioned), Direction D
 * 
 * const WALL_THICKNESS = 0.1; // meters
 * 
 * switch (direction) {
 *   case 'east':
 *     B.x = A.x + (A.dimensions[0] / 2) + (B.dimensions[0] / 2) + WALL_THICKNESS;
 *     B.z = A.z; // align vertically
 *     break;
 *   case 'west':
 *     B.x = A.x - (A.dimensions[0] / 2) - (B.dimensions[0] / 2) - WALL_THICKNESS;
 *     B.z = A.z;
 *     break;
 *   case 'north':
 *     B.x = A.x; // align horizontally
 *     B.z = A.z + (A.dimensions[2] / 2) + (B.dimensions[2] / 2) + WALL_THICKNESS;
 *     break;
 *   case 'south':
 *     B.x = A.x;
 *     B.z = A.z - (A.dimensions[2] / 2) - (B.dimensions[2] / 2) - WALL_THICKNESS;
 *     break;
 * }
 * B.y = 0; // floor level
 * 
 * Fine-tuning:
 * - If rooms partially overlap in 2D, adjust alignment offsets
 * - For L-shaped or irregular layouts, use visual center not geometric center
 * 
 * STEP 6: ASSIGN DIMENSIONS
 * --------------------------
 * For each room, create dimensions array:
 * 
 * dimensions[0] = width (X-axis dimension)
 * dimensions[1] = height (ceiling height, use global or room-specific)
 * dimensions[2] = depth (Z-axis dimension)
 * 
 * Common mistake: Swapping width/depth!
 * Verify by checking room orientation in 2D image.
 * 
 * STEP 7: VALIDATION (CRITICAL!)
 * -------------------------------
 * Before returning data, run these checks:
 * 
 * 1. Total Area Validation:
 *    calculated_area = sum(room.dimensions[0] × room.dimensions[2])
 *    if |calculated_area - totalAreaSqM| / totalAreaSqM > 0.15:
 *      ERROR: "Area mismatch > 15%"
 * 
 * 2. Overlap Detection:
 *    for each room pair (A, B):
 *      if checkRoomOverlap(A, B):
 *        ERROR: "Rooms overlap"
 * 
 * 3. Schema Validation:
 *    if !validateFloorplanData(data):
 *      ERROR: "Invalid schema"
 * 
 * 4. Spatial Topology:
 *    - Verify adjacency graph matches 3D positions
 *    - Check that shared walls in 2D = close positions in 3D
 * 
 * STEP 8: OUTPUT CONSTRUCTION
 * ----------------------------
 * Construct the final FloorplanData object:
 * 
 * {
 *   id: generateId(address),
 *   address: extractedAddress,
 *   totalAreaSqFt: extractedAreaImperial,
 *   totalAreaSqM: extractedAreaMetric,
 *   ceilingHeight: extractedHeight || 2.4, // default
 *   rooms: [
 *     {
 *       id: kebabCase(roomName),
 *       name: roomName,
 *       position: calculatedPosition,
 *       dimensions: [width, height, depth],
 *       color: assignColor(roomName),
 *       originalMeasurements: {
 *         width: originalWidthString,
 *         depth: originalDepthString
 *       }
 *     },
 *     // ... more rooms
 *   ]
 * }
 * 
 * ERROR HANDLING:
 * ---------------
 * If any step fails, provide detailed error messages:
 * 
 * - "Could not extract room labels" → OCR failed, image quality too low
 * - "Missing dimension for room X" → Need manual input or estimation
 * - "Cannot determine room adjacency" → Layout too complex, need simplification
 * - "Position calculation failed" → Circular dependencies in adjacency graph
 * - "Total area mismatch: X vs Y" → Measurement errors or missing rooms
 * 
 * EXAMPLE PROMPT FOR AI VISION MODEL:
 * ------------------------------------
 * "Analyze this floorplan image and extract the following information:
 * 
 * 1. Property address (top of image)
 * 2. Total area in sq ft and sq m
 * 3. For each room:
 *    - Name/label
 *    - Dimensions (convert all to meters)
 *    - Adjacent rooms (which walls are shared)
 * 4. Ceiling height if noted
 * 
 * Output a JSON object matching this schema: [provide FloorplanData type]
 * 
 * Calculate room positions in 3D space where:
 * - The entrance hall is at coordinates (0, 0, 0)
 * - X-axis goes left (negative) to right (positive)
 * - Z-axis goes back (negative) to front (positive)
 * - Rooms that share walls should be adjacent in the 3D coordinates
 * 
 * Ensure the sum of all room areas is within 15% of the total area."
 * 
 * @param imageData - Base64 encoded image data (data:image/png;base64,...)
 * @returns Promise resolving to validated FloorplanData structure
 */
export async function parseFloorplanImage(
  imageData: string
): Promise<FloorplanData> {
  // TODO: Implement AI vision model integration
  // 
  // Recommended implementation:
  // 
  // const response = await fetch("https://api.openai.com/v1/chat/completions", {
  //   method: "POST",
  //   headers: {
  //     "Authorization": `Bearer ${API_KEY}`,
  //     "Content-Type": "application/json"
  //   },
  //   body: JSON.stringify({
  //     model: "gpt-4-vision-preview",
  //     messages: [
  //       {
  //         role: "system",
  //         content: "You are an expert at analyzing architectural floorplans..."
  //       },
  //       {
  //         role: "user",
  //         content: [
  //           { type: "text", text: PROMPT_FROM_ABOVE },
  //           { type: "image_url", image_url: { url: imageData } }
  //         ]
  //       }
  //     ],
  //     response_format: { type: "json_object" }
  //   })
  // });
  //
  // const data = await response.json();
  // const parsed = JSON.parse(data.choices[0].message.content) as FloorplanData;
  //
  // // Validate before returning
  // if (!validateFloorplanData(parsed)) {
  //   throw new Error("AI generated invalid floorplan data");
  // }
  //
  // const validation = validateLayoutTopology(parsed);
  // if (!validation.valid) {
  //   throw new Error(`Layout validation failed: ${validation.errors.join(", ")}`);
  // }
  //
  // return parsed;
  
  throw new Error(
    "AI floorplan parsing not yet implemented. " +
    "This function requires integration with a vision AI model. " +
    "See comprehensive implementation guide above."
  );
}

/**
 * Helper: Calculate position for a room adjacent to an already-positioned room
 * 
 * This function demonstrates the exact formula AI models should use when
 * calculating room positions based on adjacency relationships.
 * 
 * @param baseRoom - The already-positioned reference room
 * @param newRoomDimensions - [width, height, depth] of the new room
 * @param direction - Direction of the new room relative to base room
 * @param wallThickness - Thickness of walls between rooms (default: 0.1m)
 * @returns Calculated [x, y, z] position for the new room
 */
export function calculateAdjacentRoomPosition(
  baseRoom: Room,
  newRoomDimensions: [number, number, number],
  direction: 'north' | 'south' | 'east' | 'west',
  wallThickness: number = 0.1
): [number, number, number] {
  const [baseX, baseY, baseZ] = baseRoom.position;
  const [baseWidth, baseHeight, baseDepth] = baseRoom.dimensions;
  const [newWidth, newHeight, newDepth] = newRoomDimensions;
  
  let x = baseX;
  let y = 0; // Always at floor level
  let z = baseZ;
  
  switch (direction) {
    case 'north': // +Z direction (forward)
      x = baseX; // maintain X alignment
      z = baseZ + (baseDepth / 2) + (newDepth / 2) + wallThickness;
      break;
      
    case 'south': // -Z direction (backward)
      x = baseX; // maintain X alignment
      z = baseZ - (baseDepth / 2) - (newDepth / 2) - wallThickness;
      break;
      
    case 'east': // +X direction (right)
      x = baseX + (baseWidth / 2) + (newWidth / 2) + wallThickness;
      z = baseZ; // maintain Z alignment
      break;
      
    case 'west': // -X direction (left)
      x = baseX - (baseWidth / 2) - (newWidth / 2) - wallThickness;
      z = baseZ; // maintain Z alignment
      break;
  }
  
  return [x, y, z];
}

/**
 * Validate Layout Topology
 * 
 * Performs comprehensive validation to ensure the 3D layout is spatially
 * valid and matches expected constraints. AI models should call this
 * before returning FloorplanData to catch errors early.
 * 
 * Checks performed:
 * 1. Room overlap detection (bounding box collision)
 * 2. Total area consistency (sum of rooms vs. declared total)
 * 3. Invalid dimensions (zero or negative values)
 * 4. Suspicious room sizes (too small, likely errors)
 * 
 * @param data - FloorplanData to validate
 * @returns Validation result with errors and warnings
 */
export function validateLayoutTopology(data: FloorplanData): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for room overlaps
  for (let i = 0; i < data.rooms.length; i++) {
    for (let j = i + 1; j < data.rooms.length; j++) {
      const roomA = data.rooms[i];
      const roomB = data.rooms[j];
      
      if (checkRoomOverlap(roomA, roomB)) {
        errors.push(
          `Overlap detected between "${roomA.name}" and "${roomB.name}". ` +
          `Check positions and dimensions.`
        );
      }
    }
  }
  
  // Check total area consistency
  const calculatedArea = data.rooms.reduce((sum, room) => {
    return sum + (room.dimensions[0] * room.dimensions[2]);
  }, 0);
  
  const areaDifference = Math.abs(calculatedArea - data.totalAreaSqM);
  const areaPercentDiff = areaDifference / data.totalAreaSqM;
  
  if (areaPercentDiff > 0.15) {
    errors.push(
      `Total area mismatch (${(areaPercentDiff * 100).toFixed(1)}% difference): ` +
      `calculated ${calculatedArea.toFixed(2)}m², ` +
      `expected ${data.totalAreaSqM}m²`
    );
  } else if (areaPercentDiff > 0.10) {
    warnings.push(
      `Total area slightly off (${(areaPercentDiff * 100).toFixed(1)}% difference). ` +
      `Consider refining room dimensions.`
    );
  }
  
  // Check for rooms with zero or negative dimensions
  data.rooms.forEach(room => {
    if (room.dimensions[0] <= 0 || room.dimensions[1] <= 0 || room.dimensions[2] <= 0) {
      errors.push(`Room "${room.name}" has invalid dimensions: ${room.dimensions.join('×')}`);
    }
  });
  
  // Check for extremely small rooms (likely errors)
  data.rooms.forEach(room => {
    const area = room.dimensions[0] * room.dimensions[2];
    if (area < 1.0) { // Less than 1 square meter
      warnings.push(
        `Room "${room.name}" is very small (${area.toFixed(2)}m²). ` +
        `Verify dimensions are correct.`
      );
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
