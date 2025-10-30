/**
 * Floorplan Data Schema
 * 
 * This schema defines the structure for 3D floorplan generation.
 * AI models should parse floorplan images and output this exact structure.
 * 
 * Coordinate System:
 * - Origin (0, 0, 0) is at the center of the floorplan
 * - X axis: left (-) to right (+)
 * - Y axis: floor (0) to ceiling (+)
 * - Z axis: back (-) to front (+)
 * 
 * Room Positioning:
 * - position: [x, y, z] - center point of the room at floor level
 * - dimensions: [width, height, depth] in meters
 *   - width: x-axis dimension
 *   - height: y-axis dimension (ceiling height)
 *   - depth: z-axis dimension
 */

export interface Room {
  /** Unique identifier for the room */
  id: string;
  
  /** Display name of the room */
  name: string;
  
  /** 3D position [x, y, z] in meters - center of the room at floor level */
  position: [number, number, number];
  
  /** Dimensions [width, height, depth] in meters */
  dimensions: [number, number, number];
  
  /** Hex color for the floor */
  color: string;
  
  /** Original measurements from floorplan (for reference) */
  originalMeasurements?: {
    width: string;  // e.g., "23'6\"" or "7.16m"
    depth: string;  // e.g., "10'10\"" or "3.30m"
  };
}

export interface FloorplanData {
  /** Unique identifier for the floorplan */
  id: string;
  
  /** Property address or name */
  address: string;
  
  /** Total area in square feet */
  totalAreaSqFt: number;
  
  /** Total area in square meters */
  totalAreaSqM: number;
  
  /** Array of rooms */
  rooms: Room[];
  
  /** Global ceiling height in meters (if consistent) */
  ceilingHeight: number;
}

/**
 * ============================================================================
 * COMPREHENSIVE AI PARSING INSTRUCTIONS
 * ============================================================================
 * 
 * This schema defines the EXACT data structure AI vision models must produce
 * when converting 2D floorplan images into 3D spatial data.
 * 
 * COORDINATE SYSTEM (Critical to understand!):
 * --------------------------------------------
 * 
 * Origin: (0, 0, 0) at the center of the entrance/hall (anchor room)
 * 
 * Axes:
 *   X-axis: LEFT (-) to RIGHT (+)
 *           Negative X = West side of floorplan
 *           Positive X = East side of floorplan
 * 
 *   Y-axis: FLOOR (0) to CEILING (+)
 *           Always 0 for room.position (floor level)
 *           Room height in room.dimensions[1]
 * 
 *   Z-axis: BACK (-) to FRONT (+)
 *           Negative Z = South/bottom of floorplan
 *           Positive Z = North/top of floorplan
 * 
 * Visual example (top-down view):
 * 
 *        NORTH (+Z)
 *            ↑
 *            |
 *  WEST      |      EAST
 *  (-X) ←----+----→ (+X)
 *            |
 *            ↓
 *        SOUTH (-Z)
 * 
 * ROOM POSITIONING:
 * -----------------
 * 
 * position: [x, y, z]
 *   - x, y, z are in METERS
 *   - Represents the CENTER POINT of the room at FLOOR LEVEL
 *   - NOT the corner! Center is critical for proper rendering
 * 
 * Example:
 *   Room at position [-3.5, 0, 2.0] with dimensions [4.0, 2.5, 3.0]
 *   occupies space:
 *     X: -5.5 to -1.5 (center -3.5 ± 2.0 half-width)
 *     Y: 0 to 2.5 (floor to ceiling)
 *     Z: 0.5 to 3.5 (center 2.0 ± 1.5 half-depth)
 * 
 * ROOM DIMENSIONS:
 * ----------------
 * 
 * dimensions: [width, height, depth]
 *   - width: X-axis dimension (left-right)
 *   - height: Y-axis dimension (floor-ceiling)
 *   - depth: Z-axis dimension (front-back)
 * 
 * CRITICAL: Do NOT swap width and depth!
 *   - A room labeled "23'6\" × 10'10\"" (wide × deep)
 *   - If oriented horizontally: width=7.16m, depth=3.30m
 *   - If oriented vertically: width=3.30m, depth=7.16m
 *   - Orientation depends on room's position in the layout!
 * 
 * MEASUREMENT CONVERSION:
 * -----------------------
 * 
 * Imperial to Metric:
 *   - 1 foot = 0.3048 meters
 *   - 1 inch = 0.0254 meters
 * 
 * Examples:
 *   "23'6\"" = (23 × 0.3048) + (6 × 0.0254) = 7.16m
 *   "10'10\"" = (10 × 0.3048) + (10 × 0.0254) = 3.30m
 *   "9'10\"" = (9 × 0.3048) + (10 × 0.0254) = 3.00m
 * 
 * Mixed notation:
 *   "23'6\" (7.16m)" → prefer the metric value: 7.16m
 * 
 * REQUIRED EXTRACTION FROM IMAGE:
 * --------------------------------
 * 
 * 1. Property Information:
 *    - Address (usually at top of floorplan)
 *    - Total area in sq ft and sq m
 *    - Ceiling height (if noted, otherwise use 2.4m default)
 * 
 * 2. For Each Room:
 *    - Name/label (e.g., "Reception/Dining Room/Kitchen")
 *    - Dimensions (extract from annotations like "23'6\" × 10'10\"")
 *    - Visual boundaries (detect walls enclosing the space)
 *    - Adjacent rooms (which walls are shared with other rooms)
 * 
 * 3. Spatial Relationships:
 *    - Build adjacency graph: room A shares wall with room B
 *    - Determine direction: A is north/south/east/west of B
 *    - Check for doors/openings connecting rooms
 * 
 * AI WORKFLOW CHECKLIST:
 * ----------------------
 * 
 * Phase 1: Image Analysis
 *   ☐ Extract all text labels using OCR
 *   ☐ Detect wall lines and room boundaries
 *   ☐ Identify door openings and windows
 *   ☐ Parse dimension annotations
 * 
 * Phase 2: Data Extraction
 *   ☐ Convert all measurements to meters
 *   ☐ Map room names to their dimensions
 *   ☐ Build adjacency graph (which rooms touch)
 *   ☐ Extract property metadata (address, total area)
 * 
 * Phase 3: Position Calculation
 *   ☐ Select anchor room (entrance/hall)
 *   ☐ Set anchor position to [0, 0, 0]
 *   ☐ For each adjacent room:
 *     ☐ Determine direction (N/S/E/W)
 *     ☐ Calculate position using formula:
 *       pos = anchor_pos ± (anchor_dim/2 + new_dim/2 + wall_thickness)
 *     ☐ Verify no overlap with existing rooms
 * 
 * Phase 4: Validation
 *   ☐ Sum of room areas ≈ total area (±15% tolerance)
 *   ☐ No rooms overlap (bounding box check)
 *   ☐ All required fields present
 *   ☐ Spatial topology matches 2D layout
 * 
 * Phase 5: Output
 *   ☐ Construct FloorplanData object
 *   ☐ Include originalMeasurements for reference
 *   ☐ Assign colors (use sequential palette)
 *   ☐ Return validated structure
 * 
 * VALIDATION RULES:
 * -----------------
 * 
 * Before outputting FloorplanData, verify:
 * 
 * 1. Schema Compliance:
 *    ✓ FloorplanData has: id, address, totalAreaSqFt, totalAreaSqM, ceilingHeight, rooms[]
 *    ✓ Each Room has: id, name, position[3], dimensions[3], color
 * 
 * 2. Spatial Validity:
 *    ✓ No two rooms overlap (check bounding boxes)
 *    ✓ Rooms that share walls in 2D are adjacent in 3D coordinates
 *    ✓ All positions and dimensions are positive numbers
 * 
 * 3. Measurement Accuracy:
 *    ✓ Sum(room areas) ≈ totalAreaSqM (within 15%)
 *    ✓ All measurements in meters
 *    ✓ Ceiling height reasonable (1.8m - 4.0m)
 * 
 * 4. Data Quality:
 *    ✓ Room IDs are kebab-case (e.g., "principal-bedroom")
 *    ✓ Colors are valid hex codes
 *    ✓ originalMeasurements preserved for reference
 * 
 * COMMON PITFALLS (Avoid these!):
 * --------------------------------
 * 
 * ❌ Using room corner instead of center for position
 *    ✅ Always use the center point of the room
 * 
 * ❌ Swapping width and depth dimensions
 *    ✅ width=X-axis, depth=Z-axis; check room orientation!
 * 
 * ❌ Forgetting to convert imperial to metric
 *    ✅ Always output in meters, not feet
 * 
 * ❌ Overlapping rooms due to missing wall thickness
 *    ✅ Add 0.1m-0.15m between adjacent rooms
 * 
 * ❌ Mirroring or rotating the entire layout
 *    ✅ Match the 2D orientation exactly
 * 
 * ❌ Total area doesn't match sum of rooms
 *    ✅ Account for hallways, walls, missing spaces
 * 
 * EXAMPLE OUTPUT:
 * ---------------
 * 
 * {
 *   "id": "whateley-road-se22",
 *   "address": "Whateley Road, East Dulwich, SE22",
 *   "totalAreaSqFt": 556,
 *   "totalAreaSqM": 51.65,
 *   "ceilingHeight": 2.51,
 *   "rooms": [
 *     {
 *       "id": "entrance-hall",
 *       "name": "Entrance Hall",
 *       "position": [0, 0, 0],
 *       "dimensions": [2.2, 2.51, 2.2],
 *       "color": "#d8ebf3",
 *       "originalMeasurements": {
 *         "width": "~2.2m",
 *         "depth": "~2.2m"
 *       }
 *     },
 *     {
 *       "id": "reception-kitchen",
 *       "name": "Reception/Dining Room/Kitchen",
 *       "position": [-3.5, 0, 0.5],
 *       "dimensions": [7.16, 2.51, 3.30],
 *       "color": "#e8f2f7",
 *       "originalMeasurements": {
 *         "width": "23'6\" (7.16m)",
 *         "depth": "10'10\" (3.30m)"
 *       }
 *     }
 *   ]
 * }
 * 
 * For complete reference implementation, see:
 *   src/data/whateley-road-floorplan.ts
 *   src/utils/floorplanParser.ts
 */
