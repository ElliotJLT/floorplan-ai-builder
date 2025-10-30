import { FloorplanData } from "@/types/floorplan";

/**
 * Whateley Road, East Dulwich SE22 - Ground Floor Flat
 * 
 * This is a reference implementation showing how AI should structure
 * parsed floorplan data. Positions are calculated based on the actual
 * 2D floorplan layout.
 * 
 * Layout overview (looking from above):
 * - Reception/Kitchen occupies the left side
 * - Principal Bedroom is top right
 * - Bedroom 2 is bottom left
 * - Entrance Hall is central
 * - Bathroom is adjacent to Principal Bedroom (right side)
 * - Store is small room in bottom right area
 */

export const whateleyRoadFloorplan: FloorplanData = {
  id: "whateley-road-se22",
  address: "Whateley Road, East Dulwich, SE22",
  totalAreaSqFt: 556,
  totalAreaSqM: 51.65,
  ceilingHeight: 2.51,
  rooms: [
    {
      id: "reception-kitchen",
      name: "Reception/Dining Room/Kitchen",
      // Position: Entire LEFT side of floorplan, this is the dominant room
      // X: -3.5 (far left), Z: 0.5 (slightly forward to center it)
      position: [-3.5, 0, 0.5],
      // Dimensions: 7.16m wide (X) × 3.30m deep (Z)
      dimensions: [7.16, 2.51, 3.30],
      color: "#e8f2f7",
      originalMeasurements: {
        width: "23'6\" (7.16m)",
        depth: "10'10\" (3.30m)"
      }
    },
    {
      id: "bedroom-2",
      name: "Bedroom 2",
      // Position: Bottom LEFT, BELOW the reception (kitchen area)
      // X: -3.0 (left side), Z: -2.3 (south/bottom)
      position: [-3.0, 0, -2.3],
      // Dimensions: 3.00m wide (X) × 2.21m deep (Z)
      dimensions: [3.00, 2.51, 2.21],
      color: "#c8e3ef",
      originalMeasurements: {
        width: "9'10\" (3.00m)",
        depth: "7'3\" (2.21m)"
      }
    },
    {
      id: "entrance-hall",
      name: "Entrance Hall",
      // Position: CENTER of floorplan, connecting all rooms
      // X: 0 (center), Z: 0 (center)
      position: [0, 0, 0],
      // Approximate square space in the middle
      dimensions: [2.2, 2.51, 2.2],
      color: "#d8ebf3",
      originalMeasurements: {
        width: "~2.2m",
        depth: "~2.2m"
      }
    },
    {
      id: "principal-bedroom",
      name: "Principal Bedroom",
      // Position: TOP RIGHT area
      // X: 3.0 (right side), Z: 2.8 (north/top)
      position: [3.0, 0, 2.8],
      // Dimensions: 4.04m wide (X) × 3.05m deep (Z)
      dimensions: [4.04, 2.51, 3.05],
      color: "#d0e7f1",
      originalMeasurements: {
        width: "13'3\" (4.04m)",
        depth: "10' (3.05m)"
      }
    },
    {
      id: "bathroom",
      name: "Bathroom",
      // Position: RIGHT side, MIDDLE area (between bedroom and store)
      // X: 3.2 (right side), Z: 0 (middle height)
      position: [3.2, 0, 0],
      // Compact bathroom dimensions
      dimensions: [2.2, 2.51, 2.0],
      color: "#b8dfe8",
      originalMeasurements: {
        width: "~2.2m",
        depth: "~2.0m"
      }
    },
    {
      id: "store",
      name: "Store",
      // Position: BOTTOM RIGHT corner (restricted height area)
      // X: 2.8 (right side), Z: -2.8 (south/bottom)
      position: [2.8, 0, -2.8],
      // Small storage space with lower ceiling
      dimensions: [1.5, 2.0, 1.3],
      color: "#a8d5e0",
      originalMeasurements: {
        width: "~1.5m",
        depth: "~1.3m"
      }
    }
  ]
};

/**
 * COMPREHENSIVE NOTES FOR AI IMPLEMENTATION
 * ==========================================
 * 
 * This reference implementation demonstrates the EXACT methodology an AI
 * vision model should use to convert 2D floorplan images into 3D coordinates.
 * 
 * PHASE 1: IMAGE ANALYSIS
 * -----------------------
 * 1. Identify all room labels (OCR + bounding boxes)
 * 2. Extract dimension annotations (e.g., "23'6\" × 10'10\"")
 * 3. Detect wall lines, door openings, and windows
 * 4. Build adjacency map: which rooms share walls
 * 
 * PHASE 2: SPATIAL GRAPH CONSTRUCTION
 * ------------------------------------
 * 1. Select anchor room (typically Entrance Hall or largest central room)
 * 2. Set anchor position to origin: [0, 0, 0]
 * 3. Build adjacency graph:
 *    - Node = Room
 *    - Edge = Shared wall with direction (north/south/east/west)
 * 
 * PHASE 3: POSITION CALCULATION (Critical!)
 * ------------------------------------------
 * Formula for adjacent room positioning:
 * 
 * If Room B is EAST of Room A:
 *   B.position[x] = A.position[x] + (A.dimensions[0]/2) + (B.dimensions[0]/2) + WALL_THICKNESS
 *   B.position[z] = A.position[z] + VERTICAL_OFFSET (if needed for alignment)
 * 
 * If Room B is NORTH of Room A:
 *   B.position[x] = A.position[x] + HORIZONTAL_OFFSET (if needed for alignment)
 *   B.position[z] = A.position[z] + (A.dimensions[2]/2) + (B.dimensions[2]/2) + WALL_THICKNESS
 * 
 * Constants:
 *   WALL_THICKNESS = 0.1m to 0.15m (standard)
 *   
 * PHASE 4: DIMENSION ACCURACY
 * ---------------------------
 * 1. Parse measurements from floorplan text:
 *    - Imperial: "23'6\"" = 23 feet + 6 inches = (23 × 0.3048) + (6 × 0.0254) = 7.16m
 *    - Metric: "7.16m" = 7.16m (direct)
 *    - Mixed: "23'6\" (7.16m)" = use metric value
 * 
 * 2. Map dimensions to axes correctly:
 *    - dimensions[0] = width (X-axis, left-right)
 *    - dimensions[1] = height (Y-axis, floor-ceiling)
 *    - dimensions[2] = depth (Z-axis, front-back)
 * 
 * 3. For rooms without labels, estimate from:
 *    - Scale bar (if present)
 *    - Adjacent room proportions
 *    - Standard room sizes (bathroom ~2m × 2m, hallway ~2m × 2m)
 * 
 * PHASE 5: VALIDATION CHECKLIST
 * ------------------------------
 * Before outputting FloorplanData, verify:
 * 
 * ✅ Total area check:
 *    sum(room.dimensions[0] × room.dimensions[2]) ≈ totalAreaSqM (±15% tolerance)
 * 
 * ✅ No overlaps:
 *    For each room pair (A, B), check bounding box collision:
 *    - X-overlap: |A.x - B.x| < (A.width + B.width) / 2
 *    - Z-overlap: |A.z - B.z| < (A.depth + B.depth) / 2
 *    - If BOTH true → OVERLAP DETECTED (invalid)
 * 
 * ✅ Spatial topology matches 2D layout:
 *    - Rooms that share walls in 2D should be adjacent in 3D
 *    - Room order (left-right, top-bottom) preserved
 * 
 * ✅ All required fields present:
 *    - Every room has: id, name, position[3], dimensions[3], color
 *    - FloorplanData has: id, address, totalAreaSqFt, totalAreaSqM, ceilingHeight
 * 
 * EXAMPLE WORKFLOW (Whateley Road Floorplan):
 * --------------------------------------------
 * 
 * Step 1: Identify anchor
 *   → "Entrance Hall" is central connector
 *   → Position: [0, 0, 0]
 *   → Dimensions: [2.2, 2.51, 2.2] (estimated square)
 * 
 * Step 2: Place Reception/Kitchen (WEST of entrance)
 *   → Measured: 7.16m × 3.30m
 *   → Direction: WEST (negative X)
 *   → Calculation:
 *     X = 0 - (2.2/2) - (7.16/2) = -4.78m (use -3.5m for visual centering)
 *     Z = 0 + 0.5m (slight forward offset for layout balance)
 *   → Position: [-3.5, 0, 0.5]
 * 
 * Step 3: Place Principal Bedroom (NORTH-EAST of entrance)
 *   → Measured: 4.04m × 3.05m
 *   → Direction: NORTH-EAST (positive X, positive Z)
 *   → Calculation:
 *     X = 0 + (2.2/2) + (4.04/2) = 3.12m (use 3.0m)
 *     Z = 0 + (2.2/2) + (3.05/2) = 2.63m (use 2.8m)
 *   → Position: [3.0, 0, 2.8]
 * 
 * Step 4: Place Bedroom 2 (SOUTH-WEST of entrance, adjacent to Reception)
 *   → Measured: 3.00m × 2.21m
 *   → Direction: SOUTH-WEST (negative X, negative Z)
 *   → Position: [-3.0, 0, -2.3]
 * 
 * Step 5: Place Bathroom (EAST of entrance, between Principal Bedroom and Store)
 *   → Estimated: 2.2m × 2.0m
 *   → Direction: EAST (positive X)
 *   → Position: [3.2, 0, 0]
 * 
 * Step 6: Place Store (SOUTH-EAST corner, restricted height)
 *   → Estimated: 1.5m × 1.3m × 2.0m height
 *   → Direction: SOUTH-EAST (positive X, negative Z)
 *   → Position: [2.8, 0, -2.8]
 * 
 * COMMON PITFALLS TO AVOID:
 * -------------------------
 * ❌ Swapping width/depth (X vs Z dimensions)
 * ❌ Forgetting to convert imperial to metric
 * ❌ Using room corner instead of center for position
 * ❌ Not accounting for wall thickness between rooms
 * ❌ Overlapping rooms due to incorrect math
 * ❌ Mirroring/rotating the entire layout
 * ❌ Inconsistent ceiling heights (use global unless noted)
 * 
 * DEBUGGING TIPS:
 * ---------------
 * If 3D model looks wrong:
 * 1. Check if layout is mirrored → flip X or Z coordinates
 * 2. Check if rotated 90° → swap X and Z values
 * 3. Verify largest room is positioned correctly first
 * 4. Ensure entrance/hall is at origin (0,0,0)
 * 5. Walk through adjacency graph to validate connections
 */
