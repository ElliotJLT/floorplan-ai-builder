/**
 * Matching Algorithm: Connect Semantic Labels to Geometric Boundaries
 *
 * This module matches room labels extracted by Claude Vision to
 * geometric room boundaries detected by computer vision.
 *
 * Strategy:
 * - Use nearest-neighbor matching based on label position → centroid distance
 * - Ensure 1-to-1 matching (no contour used twice)
 * - Apply distance threshold to reject poor matches
 */

import { RoomContour } from './visionDetection.ts';

// Import types from shared types file
interface ParsedRoomData {
  id: string;
  name: string;
  width: number;
  depth: number;
  color: string;
  labelPosition?: {
    x: number;
    y: number;
  };
  originalMeasurements?: {
    width: string;
    depth: string;
  };
}

export interface UnifiedRoomData extends ParsedRoomData {
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

/**
 * Calculate Euclidean distance between two points
 */
function distance(p1: {x: number; y: number}, p2: {x: number; y: number}): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Check if a point is inside a bounding box (with margin)
 */
function isPointInBox(
  point: {x: number; y: number},
  bbox: {x: number; y: number; width: number; height: number},
  margin: number = 0
): boolean {
  return point.x >= bbox.x - margin &&
         point.x <= bbox.x + bbox.width + margin &&
         point.y >= bbox.y - margin &&
         point.y <= bbox.y + bbox.height + margin;
}

/**
 * Match Claude-extracted room labels to CV-detected contours
 *
 * @param claudeRooms - Room data with semantic labels from Claude
 * @param contours - Geometric boundaries from computer vision
 * @returns Unified room data combining semantics and geometry
 */
export function matchRoomsToContours(
  claudeRooms: ParsedRoomData[],
  contours: RoomContour[]
): UnifiedRoomData[] {

  console.log(`Matching ${claudeRooms.length} Claude rooms to ${contours.length} contours...`);

  const unified: UnifiedRoomData[] = [];
  const usedContours = new Set<number>();

  // Track matching statistics
  let exactMatches = 0;
  let nearMatches = 0;
  let unmatched = 0;

  // For each Claude room, find the best matching contour
  for (const room of claudeRooms) {
    if (!room.labelPosition) {
      console.warn(`Room "${room.name}" (${room.id}) missing label position, skipping CV match`);
      unmatched++;
      continue;
    }

    let bestContour: RoomContour | null = null;
    let bestDistance = Infinity;
    let bestIndex = -1;
    let matchType: 'exact' | 'near' | 'far' = 'far';

    // Strategy 1: Find contour where label is inside the bounding box
    for (let i = 0; i < contours.length; i++) {
      if (usedContours.has(i)) continue;

      const contour = contours[i];

      // Check if label is inside this contour (with 20px margin for edge labels)
      if (isPointInBox(room.labelPosition, contour.bbox, 20)) {
        const dist = distance(room.labelPosition, contour.centroid);

        if (dist < bestDistance) {
          bestDistance = dist;
          bestContour = contour;
          bestIndex = i;
          matchType = 'exact';
        }
      }
    }

    // Strategy 2: If no exact match, find nearest contour by centroid
    if (!bestContour) {
      for (let i = 0; i < contours.length; i++) {
        if (usedContours.has(i)) continue;

        const contour = contours[i];
        const dist = distance(room.labelPosition, contour.centroid);

        if (dist < bestDistance) {
          bestDistance = dist;
          bestContour = contour;
          bestIndex = i;
          matchType = 'near';
        }
      }
    }

    // Apply distance threshold
    // Exact matches: no threshold (label is inside room)
    // Near matches: must be within 200px
    const maxDistance = matchType === 'exact' ? Infinity : 200;

    if (bestContour && bestDistance < maxDistance) {
      usedContours.add(bestIndex);

      unified.push({
        ...room,
        bbox: bestContour.bbox,
        centroid: bestContour.centroid,
        areaPixels: bestContour.area
      });

      if (matchType === 'exact') exactMatches++;
      else nearMatches++;

      console.log(
        `✓ Matched "${room.name}" to contour at (${bestContour.centroid.x}, ${bestContour.centroid.y}) ` +
        `[${matchType} match, distance: ${Math.round(bestDistance)}px]`
      );
    } else {
      unmatched++;
      console.warn(
        `✗ Could not match room "${room.name}" to any contour ` +
        `(min distance: ${Math.round(bestDistance)}px, threshold: ${maxDistance}px)`
      );
    }
  }

  console.log(`Matching complete: ${exactMatches} exact, ${nearMatches} near, ${unmatched} unmatched`);
  console.log(`${contours.length - usedContours.size} contours remain unused`);

  return unified;
}

/**
 * Fallback: Generate synthetic contour data from Claude dimensions
 * Used when computer vision fails or returns no contours
 */
export function generateSyntheticContours(
  claudeRooms: ParsedRoomData[],
  imageWidth: number = 1000,
  imageHeight: number = 1000
): UnifiedRoomData[] {

  console.warn('Generating synthetic contours from Claude data (CV fallback mode)');

  return claudeRooms.map((room, index) => {
    // Create synthetic geometry based on room dimensions
    // This is a simple grid layout for fallback purposes
    const cols = Math.ceil(Math.sqrt(claudeRooms.length));
    const row = Math.floor(index / cols);
    const col = index % cols;

    const cellWidth = imageWidth / cols;
    const cellHeight = imageHeight / Math.ceil(claudeRooms.length / cols);

    // Use room dimensions to scale the synthetic bbox
    const aspectRatio = room.width / room.depth;
    let bboxWidth = cellWidth * 0.8;
    let bboxHeight = bboxWidth / aspectRatio;

    if (bboxHeight > cellHeight * 0.8) {
      bboxHeight = cellHeight * 0.8;
      bboxWidth = bboxHeight * aspectRatio;
    }

    const x = col * cellWidth + (cellWidth - bboxWidth) / 2;
    const y = row * cellHeight + (cellHeight - bboxHeight) / 2;

    return {
      ...room,
      bbox: {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(bboxWidth),
        height: Math.round(bboxHeight)
      },
      centroid: {
        x: Math.round(x + bboxWidth / 2),
        y: Math.round(y + bboxHeight / 2)
      },
      areaPixels: Math.round(bboxWidth * bboxHeight)
    };
  });
}
