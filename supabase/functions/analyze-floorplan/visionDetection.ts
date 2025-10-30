/**
 * Computer Vision Module for Floorplan Room Boundary Detection
 *
 * NOTE: Canvas-based CV detection is currently disabled in Deno due to
 * compatibility issues with the canvas library (__dirname not defined).
 * The system will use Claude AI for semantic understanding and synthetic
 * contour generation instead.
 *
 * Future improvement: Implement Deno-compatible image processing
 */

export interface RoomContour {
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
  area: number;
  points?: Array<{x: number; y: number}>;
}

/**
 * Main function to detect room boundaries in a floorplan image
 * Currently returns empty array to trigger synthetic contour fallback
 */
export async function detectRoomBoundaries(imageData: string): Promise<RoomContour[]> {
  console.log('Computer vision detection skipped (Deno compatibility) - using Claude AI only');
  console.log('System will generate synthetic contours based on room dimensions');
  
  // Return empty array to trigger synthetic contour generation
  // This is the designed fallback when CV detection is unavailable
  return [];
}
