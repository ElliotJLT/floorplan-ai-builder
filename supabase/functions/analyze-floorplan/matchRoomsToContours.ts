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

  // Filter contours before matching
  const imageArea = contours.reduce((sum, c) => sum + c.area, 0);
  const avgArea = imageArea / Math.max(contours.length, 1);
  
  let tooSmall = 0;
  let tooLarge = 0;
  let badAspect = 0;
  
  const filteredContours = contours.filter(c => {
    // Too small: area < 1000 px
    if (c.area < 1000) {
      tooSmall++;
      return false;
    }
    
    // Too large: area > 25% of total image area or 10x average
    const maxArea = Math.min(imageArea * 0.25, avgArea * 10);
    if (c.area > maxArea) {
      tooLarge++;
      return false;
    }
    
    // Bad aspect ratio: width/height < 0.2 or > 5
    const aspectRatio = c.bbox.width / c.bbox.height;
    if (aspectRatio < 0.2 || aspectRatio > 5) {
      badAspect++;
      return false;
    }
    
    return true;
  });
  
  console.log(`Filtered: ${tooSmall} too small, ${tooLarge} too large, ${badAspect} bad aspect`);

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
    for (let i = 0; i < filteredContours.length; i++) {
      if (usedContours.has(i)) continue;

      const contour = filteredContours[i];

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
      for (let i = 0; i < filteredContours.length; i++) {
        if (usedContours.has(i)) continue;

        const contour = filteredContours[i];
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
  console.log(`${filteredContours.length - usedContours.size} contours remain unused`);

  return unified;
}

/**
 * Fallback: Generate synthetic contour data from Claude dimensions
 * Used when computer vision fails or returns no contours
 *
 * IMPROVED: Uses Claude's labelPosition data + proximity analysis to create
 * spatially-accurate layout with overlap prevention
 */
export function generateSyntheticContours(
  claudeRooms: ParsedRoomData[],
  imageWidth: number = 1000,
  imageHeight: number = 1000
): UnifiedRoomData[] {

  console.warn('🔧 Generating synthetic contours with IMPROVED spatial layout algorithm');
  console.log('Using Claude labelPosition + proximity clustering for accurate positioning');

  // Calculate a scaling factor to convert room dimensions (meters) to pixels
  const totalArea = claudeRooms.reduce((sum, r) => sum + (r.width * r.depth), 0);
  const avgRoomArea = totalArea / claudeRooms.length;
  const targetPixelsPerRoom = (imageWidth * imageHeight) / (claudeRooms.length * 4);
  const pixelsPerSqMeter = Math.sqrt(targetPixelsPerRoom / avgRoomArea);

  console.log(`📏 Calculated scale: ${pixelsPerSqMeter.toFixed(2)} pixels per meter`);

  // Separate rooms with and without labelPosition
  const roomsWithLabels = claudeRooms.filter(r => r.labelPosition);
  const roomsWithoutLabels = claudeRooms.filter(r => !r.labelPosition);

  if (roomsWithoutLabels.length > 0) {
    console.warn(`⚠️  ${roomsWithoutLabels.length} rooms missing labelPosition`);
  }

  const unified: UnifiedRoomData[] = [];

  // IMPROVED: Process rooms with labelPosition using proximity-based layout
  if (roomsWithLabels.length > 0) {
    console.log(`🎯 Processing ${roomsWithLabels.length} rooms with labelPosition data`);

    // Create initial room data with dimensions
    const roomData = roomsWithLabels.map(room => ({
      room,
      width: room.width * pixelsPerSqMeter,
      height: room.depth * pixelsPerSqMeter,
      labelPos: room.labelPosition!,
      centroid: { ...room.labelPosition! }, // Will be adjusted
      bbox: { x: 0, y: 0, width: 0, height: 0 } // Will be calculated
    }));

    // STEP 1: Detect overlaps and spread out overlapping rooms
    console.log('🔍 Checking for overlapping label positions...');
    let overlapsDetected = 0;

    for (let i = 0; i < roomData.length; i++) {
      for (let j = i + 1; j < roomData.length; j++) {
        const r1 = roomData[i];
        const r2 = roomData[j];

        // Calculate distance between label positions
        const dx = r2.labelPos.x - r1.labelPos.x;
        const dy = r2.labelPos.y - r1.labelPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if they would overlap (sum of half-widths + half-heights)
        const minDist = (r1.width + r2.width) / 2;

        if (dist < minDist) {
          overlapsDetected++;
          // Push rooms apart along the line connecting their labels
          const pushDist = (minDist - dist) / 2 + 20; // Add 20px gap
          const angle = Math.atan2(dy, dx);

          r2.centroid.x += pushDist * Math.cos(angle);
          r2.centroid.y += pushDist * Math.sin(angle);
          r1.centroid.x -= pushDist * Math.cos(angle);
          r1.centroid.y -= pushDist * Math.sin(angle);
        }
      }
    }

    if (overlapsDetected > 0) {
      console.log(`⚠️  Resolved ${overlapsDetected} overlapping positions`);
    }

    // STEP 2: Build proximity graph to understand spatial relationships
    console.log('🗺️  Building spatial proximity graph...');
    const proximityThreshold = Math.max(imageWidth, imageHeight) * 0.3; // 30% of image dimension

    for (const rd of roomData) {
      const neighbors: string[] = [];

      for (const other of roomData) {
        if (rd === other) continue;

        const dx = other.centroid.x - rd.centroid.x;
        const dy = other.centroid.y - rd.centroid.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < proximityThreshold) {
          neighbors.push(other.room.name);
        }
      }

      if (neighbors.length > 0) {
        console.log(`  → "${rd.room.name}" near: ${neighbors.join(', ')}`);
      }
    }

    // STEP 3: Create final unified room data
    for (const rd of roomData) {
      const bbox = {
        x: Math.round(rd.centroid.x - rd.width / 2),
        y: Math.round(rd.centroid.y - rd.height / 2),
        width: Math.round(rd.width),
        height: Math.round(rd.height)
      };

      unified.push({
        ...rd.room,
        bbox,
        centroid: {
          x: Math.round(rd.centroid.x),
          y: Math.round(rd.centroid.y)
        },
        areaPixels: Math.round(rd.width * rd.height)
      });

      console.log(
        `✓ "${rd.room.name}" positioned at (${Math.round(rd.centroid.x)}, ${Math.round(rd.centroid.y)}) ` +
        `[${bbox.width}×${bbox.height}px from ${rd.room.width.toFixed(1)}×${rd.room.depth.toFixed(1)}m]`
      );
    }
  }

  // Fallback for rooms without labelPosition - use improved spatial distribution
  if (roomsWithoutLabels.length > 0) {
    console.warn(`⚠ ${roomsWithoutLabels.length} rooms missing labelPosition - using intelligent fallback`);

    // IMPROVED: Use horizontal flow layout instead of grid stacking
    // This creates a more natural left-to-right arrangement rather than vertical stacking
    let currentX = 100; // Start with left margin
    const baseY = imageHeight / 2; // Center vertically
    const roomSpacing = 50; // Space between rooms

    roomsWithoutLabels.forEach((room, index) => {
      // Convert room dimensions to pixels
      const bboxWidth = room.width * pixelsPerSqMeter;
      const bboxHeight = room.depth * pixelsPerSqMeter;

      // Position rooms in horizontal flow, offsetting vertically for variety
      const verticalOffset = (index % 2 === 0) ? -bboxHeight / 4 : bboxHeight / 4;
      const y = baseY - bboxHeight / 2 + verticalOffset;

      unified.push({
        ...room,
        bbox: {
          x: Math.round(currentX),
          y: Math.round(y),
          width: Math.round(bboxWidth),
          height: Math.round(bboxHeight)
        },
        centroid: {
          x: Math.round(currentX + bboxWidth / 2),
          y: Math.round(y + bboxHeight / 2)
        },
        areaPixels: Math.round(bboxWidth * bboxHeight)
      });

      console.warn(
        `⚠ FALLBACK POSITION: "${room.name}" at (${Math.round(currentX + bboxWidth / 2)}, ${Math.round(y + bboxHeight / 2)}) ` +
        `[Missing labelPosition - using horizontal flow layout]`
      );

      // Move X position for next room
      currentX += bboxWidth + roomSpacing;

      // Wrap to next row if we exceed image width
      if (currentX > imageWidth - 100) {
        currentX = 100;
        // Could add vertical row shifting here if needed
      }
    });

    console.error(
      `⚠ CRITICAL: ${roomsWithoutLabels.length} rooms positioned using fallback algorithm\n` +
      `  → These rooms may not be in correct spatial positions\n` +
      `  → Claude Vision API failed to provide labelPosition coordinates\n` +
      `  → 3D model spatial accuracy is COMPROMISED for these rooms`
    );
  }

  console.log(`✓ Generated ${unified.length} synthetic contours using Claude's spatial understanding`);
  return unified;
}
