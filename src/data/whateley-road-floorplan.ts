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
      // Position: Far left side of floorplan
      position: [-4.5, 0, 0],
      // Dimensions from floorplan: 23'6" × 10'10" = 7.16m × 3.30m
      dimensions: [7.16, 2.51, 3.30],
      color: "#e8f2f7",
      originalMeasurements: {
        width: "23'6\" (7.16m)",
        depth: "10'10\" (3.30m)"
      }
    },
    {
      id: "principal-bedroom",
      name: "Principal Bedroom",
      // Position: Top right area
      position: [2.5, 0, 2.5],
      // Dimensions from floorplan: 13'3" × 10' = 4.04m × 3.05m
      dimensions: [4.04, 2.51, 3.05],
      color: "#d0e7f1",
      originalMeasurements: {
        width: "13'3\" (4.04m)",
        depth: "10' (3.05m)"
      }
    },
    {
      id: "bedroom-2",
      name: "Bedroom 2",
      // Position: Bottom left, below entrance hall
      position: [-3.0, 0, -2.5],
      // Dimensions from floorplan: 9'10" × 7'3" = 3.00m × 2.21m
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
      // Position: Center of floorplan, connecting all rooms
      position: [0, 0, 0],
      // Approximate dimensions based on floorplan layout
      dimensions: [2.0, 2.51, 2.5],
      color: "#d8ebf3",
      originalMeasurements: {
        width: "~2.0m",
        depth: "~2.5m"
      }
    },
    {
      id: "bathroom",
      name: "Bathroom",
      // Position: Right side, adjacent to Principal Bedroom
      position: [2.5, 0, -0.5],
      // Approximate dimensions - typical bathroom size
      dimensions: [2.0, 2.51, 1.8],
      color: "#b8dfe8",
      originalMeasurements: {
        width: "~2.0m",
        depth: "~1.8m"
      }
    },
    {
      id: "store",
      name: "Store",
      // Position: Bottom right corner (restricted height area)
      position: [1.5, 0, -3.2],
      // Small storage space
      dimensions: [1.5, 2.0, 1.2],
      color: "#a8d5e0",
      originalMeasurements: {
        width: "~1.5m",
        depth: "~1.2m"
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
