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
 * Notes for AI Implementation:
 * 
 * 1. Room positioning strategy:
 *    - Start with the entrance/hall as origin (0, 0, 0)
 *    - Calculate adjacent room positions based on shared walls
 *    - Ensure proper spacing to avoid overlap
 * 
 * 2. Dimension accuracy:
 *    - Always use the exact measurements from the floorplan
 *    - Convert imperial to metric: 1 foot = 0.3048m, 1 inch = 0.0254m
 *    - For unlabeled spaces, estimate based on typical room sizes
 * 
 * 3. Layout validation:
 *    - Check that total area matches sum of room areas
 *    - Verify room connections match the 2D layout
 *    - Ensure no rooms overlap (check bounding boxes)
 * 
 * 4. Position calculation formula:
 *    position[x] = previousRoom[x] + (previousRoom.width/2) + (currentRoom.width/2) + wallThickness
 *    (Similar for z-axis)
 */
