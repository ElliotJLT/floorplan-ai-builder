/**
 * Spatial Verification Tools for Agentic Adjacency Detection
 *
 * These tools allow Claude to reason about spatial relationships
 * using geometric verification functions.
 *
 * Tools:
 * - check_edge_distance: Measure distance between room edges
 * - get_overlap_percentage: Calculate alignment overlap
 * - list_nearby_rooms: Find rooms within proximity threshold
 */

import { UnifiedRoomData } from './matchRoomsToContours.ts';

type EdgeDirection = 'north' | 'south' | 'east' | 'west';

/**
 * Calculate the distance between two rooms along a specific edge direction
 *
 * Returns:
 * - Positive value: rooms are separated (gap)
 * - Negative value: rooms overlap
 * - Near-zero (0-15px): rooms likely share a wall
 *
 * @param rooms - Array of unified room data
 * @param room1_id - ID of first room
 * @param room2_id - ID of second room
 * @param edge - Direction from room1 to room2
 */
function checkEdgeDistance(
  rooms: UnifiedRoomData[],
  room1_id: string,
  room2_id: string,
  edge: EdgeDirection
): number {
  const room1 = rooms.find(r => r.id === room1_id);
  const room2 = rooms.find(r => r.id === room2_id);

  if (!room1 || !room2) {
    return Infinity;
  }

  const r1 = room1.bbox;
  const r2 = room2.bbox;

  switch (edge) {
    case 'north': // room2 is above room1 (smaller y values)
      return r1.y - (r2.y + r2.height);
    case 'south': // room2 is below room1 (larger y values)
      return r2.y - (r1.y + r1.height);
    case 'east': // room2 is to the right of room1 (larger x values)
      return r2.x - (r1.x + r1.width);
    case 'west': // room2 is to the left of room1 (smaller x values)
      return r1.x - (r2.x + r2.width);
  }
}

/**
 * Calculate the percentage of overlap between two rooms on a given axis
 *
 * High overlap (>60-70%) suggests rooms could be adjacent
 *
 * @param rooms - Array of unified room data
 * @param room1_id - ID of first room
 * @param room2_id - ID of second room
 * @param axis - 'x' for horizontal overlap, 'y' for vertical overlap
 */
function getOverlapPercentage(
  rooms: UnifiedRoomData[],
  room1_id: string,
  room2_id: string,
  axis: 'x' | 'y'
): number {
  const room1 = rooms.find(r => r.id === room1_id);
  const room2 = rooms.find(r => r.id === room2_id);

  if (!room1 || !room2) {
    return 0;
  }

  const r1 = room1.bbox;
  const r2 = room2.bbox;

  if (axis === 'x') {
    // Horizontal overlap (for north/south adjacency)
    const left = Math.max(r1.x, r2.x);
    const right = Math.min(r1.x + r1.width, r2.x + r2.width);
    const overlap = Math.max(0, right - left);
    const minWidth = Math.min(r1.width, r2.width);
    return minWidth > 0 ? (overlap / minWidth) * 100 : 0;
  } else {
    // Vertical overlap (for east/west adjacency)
    const top = Math.max(r1.y, r2.y);
    const bottom = Math.min(r1.y + r1.height, r2.y + r2.height);
    const overlap = Math.max(0, bottom - top);
    const minHeight = Math.min(r1.height, r2.height);
    return minHeight > 0 ? (overlap / minHeight) * 100 : 0;
  }
}

/**
 * List all rooms within a certain distance threshold of a given room
 *
 * @param rooms - Array of unified room data
 * @param room_id - ID of the target room
 * @param max_distance_px - Maximum distance threshold (default: 50px)
 */
function listNearbyRooms(
  rooms: UnifiedRoomData[],
  room_id: string,
  max_distance_px: number = 50
): Array<{ id: string; name: string; direction: string; distance: number }> {
  const room = rooms.find(r => r.id === room_id);
  if (!room) {
    return [];
  }

  const nearby: Array<{ id: string; name: string; direction: string; distance: number }> = [];

  for (const other of rooms) {
    if (other.id === room_id) continue;

    // Check all four directions
    const distances = [
      { dir: 'north', dist: checkEdgeDistance(rooms, room_id, other.id, 'north') },
      { dir: 'south', dist: checkEdgeDistance(rooms, room_id, other.id, 'south') },
      { dir: 'east', dist: checkEdgeDistance(rooms, room_id, other.id, 'east') },
      { dir: 'west', dist: checkEdgeDistance(rooms, room_id, other.id, 'west') },
    ];

    // Find closest direction
    const closest = distances.reduce((min, curr) =>
      curr.dist < min.dist ? curr : min
    );

    // Only include if within threshold
    if (closest.dist < max_distance_px) {
      nearby.push({
        id: other.id,
        name: other.name,
        direction: closest.dir,
        distance: Math.round(closest.dist * 10) / 10 // Round to 1 decimal
      });
    }
  }

  // Sort by distance (closest first)
  return nearby.sort((a, b) => a.distance - b.distance);
}

/**
 * Export spatial tools implementation
 */
export const spatialTools = {
  check_edge_distance: checkEdgeDistance,
  get_overlap_percentage: getOverlapPercentage,
  list_nearby_rooms: listNearbyRooms
};

/**
 * Tool definitions for Anthropic API (Claude function calling)
 */
export const toolDefinitions = [
  {
    name: "check_edge_distance",
    description: "Calculate the distance in pixels between two rooms along a specific edge direction. Returns positive if rooms are separated, negative if overlapping, near-zero (~0-15px) if they share a wall.",
    input_schema: {
      type: "object",
      properties: {
        room1_id: {
          type: "string",
          description: "ID of the first room"
        },
        room2_id: {
          type: "string",
          description: "ID of the second room"
        },
        edge: {
          type: "string",
          enum: ["north", "south", "east", "west"],
          description: "Which edge of room1 to check (north=above, south=below, east=right, west=left)"
        }
      },
      required: ["room1_id", "room2_id", "edge"]
    }
  },
  {
    name: "get_overlap_percentage",
    description: "Calculate what percentage of the smaller dimension overlaps between two rooms on a given axis. High overlap (>60%) suggests rooms could be adjacent.",
    input_schema: {
      type: "object",
      properties: {
        room1_id: {
          type: "string",
          description: "ID of the first room"
        },
        room2_id: {
          type: "string",
          description: "ID of the second room"
        },
        axis: {
          type: "string",
          enum: ["x", "y"],
          description: "x = horizontal overlap (for north/south adjacency), y = vertical overlap (for east/west adjacency)"
        }
      },
      required: ["room1_id", "room2_id", "axis"]
    }
  },
  {
    name: "list_nearby_rooms",
    description: "List all rooms within a certain distance threshold of a given room, sorted by proximity. Use this to find adjacency candidates.",
    input_schema: {
      type: "object",
      properties: {
        room_id: {
          type: "string",
          description: "ID of the room to find neighbors for"
        },
        max_distance_px: {
          type: "number",
          description: "Maximum distance in pixels (default: 50). Use 50 for direct adjacency, higher values for nearby rooms.",
          default: 50
        }
      },
      required: ["room_id"]
    }
  }
];
