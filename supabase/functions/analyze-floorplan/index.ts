import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { detectRoomBoundaries } from './visionDetection.ts';
import { matchRoomsToContours, generateSyntheticContours } from './matchRoomsToContours.ts';
import { determineAdjacencyWithAgent, detectAdjacencyGeometric } from './agenticAdjacency.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData } = await req.json();
    
    if (!imageData) {
      throw new Error('No image data provided');
    }

    const CLAUDE_API_KEY = Deno.env.get('Homely3D');
    if (!CLAUDE_API_KEY) {
      throw new Error('Claude API key not configured');
    }

    console.log('=== HYBRID CV + AGENTIC LLM FLOORPLAN ANALYSIS ===');
    console.log('Starting multi-stage analysis pipeline...');

    // ========================================================================
    // STAGE 1: Computer Vision - Detect Room Boundaries
    // ========================================================================
    console.log('\n--- STAGE 1: Computer Vision Room Detection ---');
    const contours = await detectRoomBoundaries(imageData);
    console.log(`✓ Detected ${contours.length} room boundaries via CV`);

    // ========================================================================
    // STAGE 2: Claude Vision - Extract Semantic Labels
    // ========================================================================
    console.log('\n--- STAGE 2: Claude Semantic Extraction ---');

    const systemPrompt = `You are an expert at analyzing 2D architectural floorplans.

Your task: Extract room names, dimensions, label positions, total area, and identify the entry room.

INSTRUCTIONS:
1. Identify all rooms with their dimensions
   - Measure width and depth in meters from the floorplan
   - Convert from feet/inches if needed (1 foot = 0.3048m)
   - Include original measurements as shown on plan
   - IMPORTANT: Record the pixel coordinates where each room's label appears on the image
     * Measure from the TOP-LEFT corner of the image
     * x = horizontal position (0 = left edge)
     * y = vertical position (0 = top edge)
     * The label position should be where the room name text is located

2. Calculate total floor area (in both sqFt and sqM)

3. Identify the entry room (usually has front door/main entrance)

4. Assign colors based on room type:
   - Living/Reception rooms: warm tones (#fef3c7, #fde68a)
   - Bedrooms: cool blues (#e0f2fe, #bae6fd)
   - Bathrooms: aqua (#cffafe, #a5f3fc)
   - Kitchen: green (#d1fae5, #a7f3d0)
   - Halls/Corridors: neutral (#f3f4f6, #e5e7eb)

Return ONLY valid JSON in this exact format:
{
  "id": "unique-id",
  "address": "property address from plan",
  "totalAreaSqFt": 556,
  "totalAreaSqM": 51.65,
  "ceilingHeight": 2.4,
  "entryRoomId": "entrance-hall",
  "rooms": [
    {
      "id": "entrance-hall",
      "name": "Entrance Hall",
      "width": 2.5,
      "depth": 1.8,
      "color": "#e5e7eb",
      "labelPosition": {
        "x": 450,
        "y": 320
      },
      "originalMeasurements": {
        "width": "2.50m",
        "depth": "1.80m"
      }
    },
    {
      "id": "reception",
      "name": "Reception",
      "width": 5.2,
      "depth": 3.8,
      "color": "#fef3c7",
      "labelPosition": {
        "x": 680,
        "y": 250
      },
      "originalMeasurements": {
        "width": "5.20m",
        "depth": "3.80m"
      }
    }
  ]
}

CRITICAL RULES:
- Use lowercase IDs with hyphens (e.g., "entrance-hall", "bedroom-1")
- Ensure all measurements are in meters
- totalAreaSqM and totalAreaSqFt must match room dimensions
- entryRoomId must match one of the room IDs
- labelPosition is REQUIRED for each room - estimate pixel coordinates carefully
- DO NOT include adjacency data - spatial relationships will be calculated separately

DUPLICATE PREVENTION (CRITICAL):
- Each room should appear ONLY ONCE in the rooms array - NO EXCEPTIONS
- If a space serves multiple purposes (e.g., "Kitchen/Dining Room"), treat it as ONE room
  * Use the primary function for the ID
  * Keep the full descriptive name
  * Example: id: "kitchen-dining", name: "Kitchen/Dining Room"
- DO NOT create separate entries for:
  * Kitchen + Dining (if they're one open space)
  * Living + Reception (same room, different names)
  * Bathroom + WC (unless they're genuinely separate rooms)
  * Bedroom + Dressing area (part of the same bedroom)
- DOUBLE CHECK: Count your rooms before submitting - each physical space = 1 entry
- If you see "Reception/Living Room" or similar, that's ONE room, not two`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageData.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
                  data: imageData.split(',')[1]
                }
              },
              {
                type: 'text',
                text: systemPrompt
              }
            ]
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    
    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('✓ Claude response received, parsing...');

    // Extract JSON from potential markdown code blocks
    let jsonText = content;
    if (content.includes('```json')) {
      jsonText = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonText = content.split('```')[1].split('```')[0].trim();
    }

    const claudeData = JSON.parse(jsonText);
    console.log(`✓ Extracted ${claudeData.rooms?.length} room labels from Claude`);

    // Post-process: Remove duplicate rooms with aggressive normalization
    const seenRooms = new Map<string, any>(); // normalized name -> room data
    const originalCount = claudeData.rooms.length;

    // Helper: Normalize room name for comparison (MORE AGGRESSIVE)
    function normalizeRoomName(name: string): string {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
        .replace(/bedroom(\d)/g, 'bed$1') // bed1, bed2, etc.
        .replace(/bathroom(\d)/g, 'bath$1')
        .replace(/reception/g, 'living') // Treat reception = living
        .replace(/lounge/g, 'living')
        .replace(/dining/g, '') // Remove dining to catch "living/dining" = "living"
        .replace(/room/g, '') // Remove "room" word
        .replace(/kitchen/g, 'kit') // Shorten kitchen
        .replace(/wc/g, 'bathroom'); // WC = bathroom
    }

    // Helper: Check if two rooms are likely duplicates based on area
    function areaSimilarity(area1: number, area2: number): number {
      const diff = Math.abs(area1 - area2);
      const avg = (area1 + area2) / 2;
      return 1 - (diff / avg); // 1.0 = identical, 0.0 = completely different
    }

    for (const room of claudeData.rooms) {
      const normalized = normalizeRoomName(room.name);
      const area = room.width * room.depth;

      if (seenRooms.has(normalized)) {
        // Potential duplicate - check area similarity
        const existingRoom = seenRooms.get(normalized);
        const existingArea = existingRoom.width * existingRoom.depth;
        const similarity = areaSimilarity(area, existingArea);

        if (similarity > 0.9) {
          // Very similar (>90%) - likely a duplicate
          console.warn(`⚠ Duplicate room detected and removed: "${room.name}" (similar to "${existingRoom.name}", ${(similarity * 100).toFixed(0)}% area match)`);

          // Keep the one with more complete data or longer name (often has more info)
          if (room.name.length > existingRoom.name.length || !existingRoom.labelPosition) {
            console.log(`  → Replacing with better version: "${room.name}"`);
            seenRooms.set(normalized, room);
          }
        } else {
          // Different areas - might be genuinely different rooms (e.g., Bedroom 1 vs Bedroom 2)
          console.log(`⚠ Potential duplicate with different size: "${room.name}" vs "${existingRoom.name}" (${(similarity * 100).toFixed(0)}% match)`);
          // Add a suffix to make it unique AND update the room ID
          let suffix = 2;
          let uniqueKey = `${normalized}${suffix}`;
          while (seenRooms.has(uniqueKey)) {
            suffix++;
            uniqueKey = `${normalized}${suffix}`;
          }
          // CRITICAL: Update room.id to prevent React key conflicts
          const originalId = room.id;
          room.id = `${room.id}-${suffix}`;
          console.log(`  → Updated room ID: "${originalId}" → "${room.id}"`);
          seenRooms.set(uniqueKey, room);
        }
      } else {
        seenRooms.set(normalized, room);
      }
    }

    claudeData.rooms = Array.from(seenRooms.values());

    if (originalCount !== claudeData.rooms.length) {
      console.log(`✓ Processed ${originalCount - claudeData.rooms.length} duplicate room(s)`);
    }

    // ========================================================================
    // STAGE 3: Matching Algorithm - Connect Semantics to Geometry
    // ========================================================================
    console.log('\n--- STAGE 3: Matching Labels to Contours ---');

    let unifiedRooms;
    let usedSyntheticContours = false;

    if (contours.length > 0) {
      unifiedRooms = matchRoomsToContours(claudeData.rooms, contours);
      console.log(`✓ Successfully matched ${unifiedRooms.length}/${claudeData.rooms.length} rooms`);

      // If matching failed for most rooms, use synthetic contours
      if (unifiedRooms.length < claudeData.rooms.length * 0.5) {
        console.warn('Matching rate too low, falling back to synthetic contours');
        unifiedRooms = generateSyntheticContours(claudeData.rooms);
        usedSyntheticContours = true;
      }
    } else {
      console.warn('No CV contours detected, using synthetic contours');
      unifiedRooms = generateSyntheticContours(claudeData.rooms);
      usedSyntheticContours = true;
    }
    
    if (usedSyntheticContours) {
      console.warn('⚠ Synthetic contours detected - skipping image-based positioning');
    }

    // ========================================================================
    // STAGE 4: Agentic Verification - Determine Adjacency with AI Reasoning
    // ========================================================================
    console.log('\n--- STAGE 4: Agentic Adjacency Verification ---');

    let adjacency: any[] = [];
    try {
      // Hard timeout to prevent function timeouts when the agent loops too long
      const AGENT_TIMEOUT_MS = 12000;
      const agentPromise = determineAdjacencyWithAgent(unifiedRooms, CLAUDE_API_KEY);
      adjacency = await Promise.race([
        agentPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('agent_timeout')), AGENT_TIMEOUT_MS))
      ]) as any[];
      console.log(`✓ Agent determined ${adjacency.length} adjacency relationships`);

      // Fallback to geometric if agent returns nothing
      if (adjacency.length === 0 && unifiedRooms.length > 1) {
        console.warn('Agent returned no adjacencies, using geometric fallback');
        adjacency = detectAdjacencyGeometric(unifiedRooms);
      }
    } catch (error) {
      console.error('Agentic verification failed or timed out, using geometric fallback:', error);
      adjacency = detectAdjacencyGeometric(unifiedRooms);
    }

    // ========================================================================
    // FINAL: Construct Response
    // ========================================================================
    console.log('\n--- Analysis Complete ---');

    const response_data = {
      id: claudeData.id,
      address: claudeData.address,
      totalAreaSqFt: claudeData.totalAreaSqFt,
      totalAreaSqM: claudeData.totalAreaSqM,
      ceilingHeight: claudeData.ceilingHeight,
      entryRoomId: claudeData.entryRoomId,
      rooms: unifiedRooms.map(r => ({
        id: r.id,
        name: r.name,
        width: r.width,
        depth: r.depth,
        color: r.color,
        originalMeasurements: r.originalMeasurements,
        // Include pixel data for image-based positioning
        bbox: r.bbox,
        centroid: r.centroid,
        areaPixels: r.areaPixels,
        labelPosition: r.labelPosition
      })),
      adjacency: adjacency,
      metadata: {
        method: 'hybrid-cv-agent',
        contoursDetected: contours.length,
        roomsMatched: unifiedRooms.length,
        adjacenciesFound: adjacency.length,
        usedSyntheticContours: usedSyntheticContours,
        pipeline: 'cv-detection → claude-labels → matching → agentic-adjacency'
      }
    };

    console.log('Pipeline summary:', {
      rooms: response_data.rooms.length,
      adjacencies: response_data.adjacency.length,
      method: response_data.metadata.method
    });

    return new Response(
      JSON.stringify(response_data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error analyzing floorplan:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
