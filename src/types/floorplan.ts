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

// ============================================================================
// AI Extraction Types (for hybrid approach)
// ============================================================================

export type EdgeDirection = 'north' | 'south' | 'east' | 'west';

export interface AdjacencyRelation {
  /** First room ID */
  room1: string;
  
  /** Second room ID */
  room2: string;
  
  /** Which edge of room1 touches room2 */
  edge: EdgeDirection;
}

export interface ParsedRoomData {
  id: string;
  name: string;
  /** Width in meters (X-axis) */
  width: number;
  /** Depth in meters (Z-axis) */
  depth: number;
  color: string;
  /** Pixel coordinates of the room label on the floorplan image (for CV matching) */
  labelPosition?: {
    x: number;
    y: number;
  };
  originalMeasurements?: {
    width: string;
    depth: string;
  };
}

export interface AIFloorplanResponse {
  id: string;
  address: string;
  totalAreaSqFt: number;
  totalAreaSqM: number;
  ceilingHeight: number;
  entryRoomId: string;
  rooms: UnifiedRoomData[];
  /** Optional adjacency data (used for layout fallback) */
  adjacency?: AdjacencyRelation[];
  /** Metadata about the detection pipeline */
  metadata?: {
    method?: string;
    contoursDetected?: number;
    roomsMatched?: number;
    adjacenciesFound?: number;
    usedSyntheticContours?: boolean;
    pipeline?: string;
  };
}

// ============================================================================
// Computer Vision Types (for hybrid CV approach)
// ============================================================================

export interface RoomContour {
  /** Bounding rectangle around the room */
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Center point of the room */
  centroid: {
    x: number;
    y: number;
  };
  /** Area in pixels */
  area: number;
  /** Raw contour points (for advanced processing) */
  points?: Array<{x: number; y: number}>;
}

export interface UnifiedRoomData extends ParsedRoomData {
  /** Geometry from computer vision */
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  centroid: {
    x: number;
    y: number;
  };
  areaPixels: number;
}
