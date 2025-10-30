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
 * AI Parsing Instructions:
 * 
 * When analyzing a floorplan image, extract:
 * 1. Room names and labels
 * 2. Dimensions (convert to meters if in feet/inches)
 * 3. Spatial relationships (which rooms are adjacent)
 * 4. Calculate positions based on room connections
 * 5. Use center of each room as position coordinates
 * 6. Ensure rooms connect properly (shared walls should align)
 * 
 * Example workflow:
 * 1. Identify all rooms and their dimensions
 * 2. Start from largest room or entrance as origin reference
 * 3. Calculate relative positions based on adjacency
 * 4. Verify no overlapping rooms
 * 5. Output FloorplanData structure
 */
