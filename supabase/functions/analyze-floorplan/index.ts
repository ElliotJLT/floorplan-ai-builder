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

⚠️ CRITICAL REQUIREMENT - SPATIAL COORDINATES ⚠️
The labelPosition field is ABSOLUTELY MANDATORY for every room. Without accurate pixel coordinates,
the 3D model will be completely broken and rooms will be stacked in nonsense positions.

INSTRUCTIONS:
1. Identify all rooms with their dimensions
   - Measure width and depth in meters from the floorplan
   - Convert from feet/inches if needed (1 foot = 0.3048m)
   - Include original measurements as shown on plan
   - ⚠️ CRITICAL: Record the pixel coordinates where each room's label appears on the image
     * Measure from the TOP-LEFT corner of the image (origin: 0,0)
     * x = horizontal position (0 = left edge, increases rightward)
     * y = vertical position (0 = top edge, increases downward)
     * Place the coordinates at the CENTER of the room name text
     * If the room label is split across multiple lines, use the center of the text block
     * For large rooms with labels in corners, estimate the visual center of the room space
     * DOUBLE CHECK: Every room MUST have valid labelPosition coordinates

2. Calculate total floor area (in both sqFt and sqM)

3. Identify the entry room (usually has front door/main entrance)

4. Include ALL spaces shown on the floorplan:
   - Interior rooms (bedrooms, bathrooms, kitchen, living, halls)
   - Exterior spaces (balconies, terraces, patios, gardens)
   - Utility spaces (storage, closets if shown as separate rooms)

5. Assign colors based on room type:
   - Living/Reception rooms: warm tones (#fef3c7, #fde68a)
   - Bedrooms: cool blues (#e0f2fe, #bae6fd)
   - Bathrooms: aqua (#cffafe, #a5f3fc)
   - Kitchen: green (#d1fae5, #a7f3d0)
   - Halls/Corridors: neutral (#f3f4f6, #e5e7eb)
   - Balconies/Terraces: light green (#f0fdf4, #dcfce7)

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
- ⚠️ labelPosition is ABSOLUTELY REQUIRED for EVERY room - missing coordinates = broken 3D model
- Carefully measure pixel coordinates for each room label
- DO NOT include adjacency data - spatial relationships will be calculated separately

DUPLICATE PREVENTION (CRITICAL):
⚠️ Each room should appear EXACTLY ONCE in the rooms array - NO DUPLICATES ALLOWED ⚠️

Common mistakes that create duplicates:
- If a space serves multiple purposes (e.g., "Kitchen/Dining Room"), treat it as ONE room
  * Use the primary function for the ID
  * Keep the full descriptive name
  * Example: id: "kitchen-dining", name: "Kitchen/Dining Room"
- DO NOT create separate entries for:
  * Kitchen + Dining (if they're one open space)
  * Living + Reception (same room, different names)
  * Bathroom + WC (unless they're genuinely separate rooms)
  * Bedroom + Dressing area (part of the same bedroom)
  * Multiple detections of the same room with slightly different measurements

VALIDATION BEFORE SUBMITTING:
1. Count your rooms - does the number match the physical spaces in the floorplan?
2. Check for duplicate room names - each should be unique
3. Verify every room has labelPosition with valid x,y coordinates
4. If you see "Kitchen/Living Room" or similar combined names, that's ONE room, not two or three
5. Compare room areas - if two rooms have >80% similar areas and similar names, they're likely duplicates`;

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
      console.log('Extracted JSON from markdown code block');
    } else if (content.includes('```')) {
      jsonText = content.split('```')[1].split('```')[0].trim();
      console.log('Extracted JSON from generic code block');
    }

    // Parse and validate Claude's response
    let claudeData;
    try {
      claudeData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', parseError);
      console.error('Raw content preview:', content.substring(0, 500));
      throw new Error('Invalid JSON response from Claude Vision API');
    }

    // Validate response structure
    if (!claudeData.rooms || !Array.isArray(claudeData.rooms)) {
      console.error('Invalid response structure - missing or invalid rooms array');
      console.error('Response keys:', Object.keys(claudeData));
      throw new Error('Claude response missing required "rooms" array');
    }

    console.log(`✓ Extracted ${claudeData.rooms.length} room labels from Claude`);
    console.log(`  Total area: ${claudeData.totalAreaSqM}sqM (${claudeData.totalAreaSqFt}sqFt)`);
    console.log(`  Entry room: ${claudeData.entryRoomId}`);

    // Post-process: Remove duplicate rooms with aggressive normalization
    console.log('\n--- Duplicate Detection & Validation ---');
    const seenRooms = new Map<string, any>(); // normalized name -> room data
    const originalCount = claudeData.rooms.length;

    // Validate that all rooms have required fields
    let missingLabelCount = 0;
    let missingDimensionsCount = 0;
    for (const room of claudeData.rooms) {
      if (!room.labelPosition) {
        missingLabelCount++;
        console.warn(`⚠ Room "${room.name}" (${room.id}) missing labelPosition`);
      }
      if (!room.width || !room.depth) {
        missingDimensionsCount++;
        console.warn(`⚠ Room "${room.name}" (${room.id}) missing dimensions`);
      }
    }

    if (missingLabelCount > 0) {
      console.warn(`${missingLabelCount}/${originalCount} rooms missing spatial coordinates`);
    }
    if (missingDimensionsCount > 0) {
      console.error(`${missingDimensionsCount}/${originalCount} rooms missing dimensions - layout may be inaccurate`);
    }

    // Helper: Normalize room name for comparison
    // IMPROVED: Less aggressive to preserve meaningful distinctions
    function normalizeRoomName(name: string): string {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
        .replace(/bedroom(\d)/g, 'bed$1') // bed1, bed2, etc.
        .replace(/bathroom(\d)/g, 'bath$1')
        .replace(/reception/g, 'living') // Treat reception = living
        .replace(/lounge/g, 'living')
        .replace(/room/g, '') // Remove "room" word
        .replace(/wc/g, 'bathroom'); // WC = bathroom
        // NOTE: Removed overly aggressive rules like removing "dining" and "kitchen"
        // to prevent false duplicates (e.g., "Living/Dining" vs "Kitchen/Dining")
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

        // IMPROVED: Lowered threshold from 0.7 to 0.6 (60% similarity = likely duplicate)
        // This catches cases where Claude returns slightly different measurements
        // e.g., 19.5 sqm vs 20.1 sqm vs 18.9 sqm for the same room
        if (similarity > 0.6) {
          // Likely a duplicate (>60% area match)
          console.warn(`⚠ DUPLICATE DETECTED: "${room.name}" matches "${existingRoom.name}" (${(similarity * 100).toFixed(0)}% area similarity)`);
          console.log(`  → Areas: ${area.toFixed(2)}sqm vs ${existingArea.toFixed(2)}sqm`);
          console.log(`  → Normalized: "${normalized}"`);

          // Keep the one with more complete data
          const roomQuality = (room.labelPosition ? 10 : 0) + room.name.length;
          const existingQuality = (existingRoom.labelPosition ? 10 : 0) + existingRoom.name.length;

          if (roomQuality > existingQuality) {
            console.log(`  → Replacing with better version: "${room.name}" (quality: ${roomQuality} > ${existingQuality})`);
            // Preserve the existing room's ID to maintain consistency
            room.id = existingRoom.id;
            seenRooms.set(normalized, room);
          } else {
            console.log(`  → Keeping existing version: "${existingRoom.name}" (quality: ${existingQuality} >= ${roomQuality})`);
          }
        } else {
          // Different areas - genuinely different rooms (e.g., Bedroom 1 vs Bedroom 2)
          console.log(`ℹ Similar name, different room: "${room.name}" vs "${existingRoom.name}" (${(similarity * 100).toFixed(0)}% area match)`);
          console.log(`  → Areas: ${area.toFixed(2)}sqm vs ${existingArea.toFixed(2)}sqm - treating as separate rooms`);

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

    const finalCount = claudeData.rooms.length;
    if (originalCount !== finalCount) {
      console.log(`✓ Removed ${originalCount - finalCount} duplicate room(s) (${originalCount} → ${finalCount})`);
    } else {
      console.log('✓ No duplicates detected');
    }

    // Final validation: check for unique IDs
    const idSet = new Set(claudeData.rooms.map((r: any) => r.id));
    if (idSet.size !== claudeData.rooms.length) {
      console.error('⚠ WARNING: Duplicate room IDs detected after deduplication!');
      const idCounts = new Map<string, number>();
      claudeData.rooms.forEach((r: any) => {
        idCounts.set(r.id, (idCounts.get(r.id) || 0) + 1);
      });
      idCounts.forEach((count, id) => {
        if (count > 1) {
          console.error(`  → ID "${id}" appears ${count} times`);
        }
      });
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
      // INCREASED: 12s → 25s → 40s to give agent more time for complex floorplans
      // Logs show agent reaching iteration 8-9 before timeout, needs more time
      const AGENT_TIMEOUT_MS = 40000;
      console.log(`Starting agentic adjacency analysis (timeout: ${AGENT_TIMEOUT_MS}ms)...`);

      const agentPromise = determineAdjacencyWithAgent(unifiedRooms, CLAUDE_API_KEY);
      adjacency = await Promise.race([
        agentPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('agent_timeout')), AGENT_TIMEOUT_MS))
      ]) as any[];

      console.log(`✓ Agent determined ${adjacency.length} adjacency relationships`);

      // Fallback to geometric if agent returns nothing
      if (adjacency.length === 0 && unifiedRooms.length > 1) {
        console.warn('Agent returned no adjacencies (possible for disconnected rooms), using geometric fallback');
        adjacency = detectAdjacencyGeometric(unifiedRooms);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Agentic verification ${errorMsg === 'agent_timeout' ? 'timed out' : 'failed'}: ${errorMsg}`);
      console.log('Falling back to geometric adjacency detection...');

      try {
        adjacency = detectAdjacencyGeometric(unifiedRooms);
      } catch (fallbackError) {
        console.error('Geometric fallback also failed:', fallbackError);
        adjacency = []; // Return empty adjacency list rather than failing completely
      }
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

    console.log('\n=== PIPELINE SUMMARY ===');
    console.log(`Rooms detected: ${response_data.rooms.length}`);
    console.log(`Adjacencies found: ${response_data.adjacency.length}`);
    console.log(`Method: ${response_data.metadata.method}`);
    console.log(`CV contours: ${response_data.metadata.contoursDetected}`);
    console.log(`Synthetic contours: ${response_data.metadata.usedSyntheticContours ? 'Yes' : 'No'}`);
    console.log(`Total area: ${response_data.totalAreaSqM}sqM (${response_data.totalAreaSqFt}sqFt)`);
    console.log('========================\n');

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
