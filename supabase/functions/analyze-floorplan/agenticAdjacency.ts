/**
 * Agentic Adjacency Verification
 *
 * Uses Claude with function calling (tool use) to reason about spatial
 * relationships and determine room adjacency with high accuracy.
 *
 * Claude uses geometric verification tools to:
 * 1. Find nearby rooms
 * 2. Check edge distances
 * 3. Verify alignment overlap
 * 4. Build accurate adjacency list
 */

import { UnifiedRoomData } from './matchRoomsToContours.ts';
import { spatialTools, toolDefinitions } from './spatialTools.ts';

type EdgeDirection = 'north' | 'south' | 'east' | 'west';

interface AdjacencyRelation {
  room1: string;
  room2: string;
  edge: EdgeDirection;
}

/**
 * Use Claude with tool calling to determine room adjacencies
 *
 * @param rooms - Unified room data with geometry
 * @param apiKey - Anthropic API key
 * @returns List of verified adjacency relationships
 */
export async function determineAdjacencyWithAgent(
  rooms: UnifiedRoomData[],
  apiKey: string
): Promise<AdjacencyRelation[]> {

  console.log('Starting agentic adjacency verification...');

  // Prepare room summary for Claude
  const roomSummary = rooms.map(r => ({
    id: r.id,
    name: r.name,
    centroid: r.centroid,
    bbox: r.bbox,
    dimensions_meters: {
      width: r.width,
      depth: r.depth
    }
  }));

  const systemPrompt = `You are a spatial reasoning agent analyzing architectural floorplans.

Your task: Determine which rooms are adjacent (share walls) based on their geometric positions.

AVAILABLE TOOLS:
1. list_nearby_rooms(room_id, max_distance_px) - Find candidate adjacent rooms
2. check_edge_distance(room1_id, room2_id, edge) - Verify if rooms touch on an edge
3. get_overlap_percentage(room1_id, room2_id, axis) - Check if rooms are aligned

STRATEGY:
1. For each room, call list_nearby_rooms with max_distance_px=50 to find adjacency candidates
2. For each candidate pair:
   - Check all four directions (north/south/east/west) with check_edge_distance
   - If distance is near-zero (0-15px), they likely share a wall
   - Verify alignment with get_overlap_percentage (>60% = good alignment)
3. Only report adjacencies with BOTH close distance AND good alignment
4. Consider typical floorplan patterns (hallways connect multiple rooms, bathrooms near bedrooms, etc.)

ROOMS IN THIS FLOORPLAN:
${JSON.stringify(roomSummary, null, 2)}

IMPORTANT:
- Each adjacency should be reported ONCE (don't report both room1→room2 AND room2→room1)
- The 'edge' field should be from room1's perspective (e.g., if room2 is north of room1, edge='north')
- Be systematic: check every room for adjacencies
- Verify spatial relationships with tools before concluding

Think step-by-step. Use tools to verify each potential adjacency.

When you have determined all adjacencies, return your final answer as a JSON array:
[
  {"room1": "entrance-hall", "room2": "kitchen", "edge": "west"},
  {"room1": "kitchen", "room2": "living-room", "edge": "north"}
]`;

  let messages: any[] = [
    {
      role: "user",
      content: systemPrompt
    }
  ];

  let adjacencyList: AdjacencyRelation[] = [];
  let iterations = 0;
  const MAX_ITERATIONS = 15; // Allow enough iterations for tool use

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`Agentic iteration ${iterations}...`);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4',
          max_tokens: 4096,
          tools: toolDefinitions,
          messages: messages
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Agent API error:', response.status, errorText);
        break;
      }

      const data = await response.json();

      // Check stop reason
      if (data.stop_reason === 'end_turn') {
        // Claude is done reasoning
        console.log('Agent finished reasoning');

        // Extract final answer
        const textContent = data.content.find((c: any) => c.type === 'text');
        if (textContent) {
          // Try to parse JSON array from response
          const jsonMatch = textContent.text.match(/\[[\s\S]*?\]/);
          if (jsonMatch) {
            try {
              adjacencyList = JSON.parse(jsonMatch[0]);
              console.log(`Agent determined ${adjacencyList.length} adjacencies`);
            } catch (e) {
              console.error('Failed to parse adjacency JSON:', e);
            }
          } else {
            console.warn('No JSON array found in agent response');
          }
        }
        break;
      }

      if (data.stop_reason === 'tool_use') {
        // Claude wants to use tools
        const toolUses = data.content.filter((c: any) => c.type === 'tool_use');
        const toolResults: any[] = [];

        console.log(`Agent calling ${toolUses.length} tool(s)`);

        for (const toolUse of toolUses) {
          console.log(`  → ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

          let result: any;
          try {
            switch (toolUse.name) {
              case 'check_edge_distance':
                result = spatialTools.check_edge_distance(
                  rooms,
                  toolUse.input.room1_id,
                  toolUse.input.room2_id,
                  toolUse.input.edge
                );
                break;
              case 'get_overlap_percentage':
                result = spatialTools.get_overlap_percentage(
                  rooms,
                  toolUse.input.room1_id,
                  toolUse.input.room2_id,
                  toolUse.input.axis
                );
                break;
              case 'list_nearby_rooms':
                result = spatialTools.list_nearby_rooms(
                  rooms,
                  toolUse.input.room_id,
                  toolUse.input.max_distance_px || 50
                );
                break;
              default:
                result = { error: 'Unknown tool' };
            }

            console.log(`    Result: ${JSON.stringify(result)}`);
          } catch (error) {
            console.error(`Tool execution error:`, error);
            result = { error: String(error) };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        }

        // Add Claude's response and tool results to conversation
        messages.push({
          role: 'assistant',
          content: data.content
        });

        messages.push({
          role: 'user',
          content: toolResults
        });

      } else if (data.stop_reason === 'max_tokens') {
        console.warn('Agent hit max tokens limit');
        break;
      } else {
        console.error('Unexpected stop reason:', data.stop_reason);
        break;
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      console.warn('Agent reached max iterations without completing');
    }

    console.log(`Agentic verification complete: ${adjacencyList.length} adjacencies found in ${iterations} iterations`);
    return adjacencyList;

  } catch (error) {
    console.error('Error in agentic adjacency verification:', error);
    // Return empty array on error - system can use fallback
    return [];
  }
}

/**
 * Fallback: Simple geometric adjacency detection (no AI reasoning)
 * Used when agentic verification fails
 */
export function detectAdjacencyGeometric(rooms: UnifiedRoomData[]): AdjacencyRelation[] {
  console.warn('Using fallback geometric adjacency detection');

  const adjacencies: AdjacencyRelation[] = [];
  const DISTANCE_THRESHOLD = 15; // pixels
  const OVERLAP_THRESHOLD = 60; // percent

  for (let i = 0; i < rooms.length; i++) {
    const room1 = rooms[i];

    for (let j = i + 1; j < rooms.length; j++) {
      const room2 = rooms[j];

      // Check all four directions
      const directions: EdgeDirection[] = ['north', 'south', 'east', 'west'];

      for (const edge of directions) {
        const distance = spatialTools.check_edge_distance(rooms, room1.id, room2.id, edge);

        if (Math.abs(distance) <= DISTANCE_THRESHOLD) {
          // Rooms are close on this edge, check alignment
          const axis = (edge === 'north' || edge === 'south') ? 'x' : 'y';
          const overlap = spatialTools.get_overlap_percentage(rooms, room1.id, room2.id, axis);

          if (overlap >= OVERLAP_THRESHOLD) {
            adjacencies.push({
              room1: room1.id,
              room2: room2.id,
              edge: edge
            });
            break; // Only report one adjacency per room pair
          }
        }
      }
    }
  }

  console.log(`Fallback detection found ${adjacencies.length} adjacencies`);
  return adjacencies;
}
