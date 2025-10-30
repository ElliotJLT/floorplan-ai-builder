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

DUPLICATE PREVENTION:
- Each room should appear ONLY ONCE in the rooms array
- If a space serves multiple purposes (e.g., "Kitchen/Dining Room"), use the primary function name
- DO NOT create separate entries for combined spaces
- Example: "Kitchen/Dining Room" → use id: "kitchen", name: "Kitchen/Dining Room"
- Common duplicates to avoid: Kitchen + Dining Room, Living + Reception, Bathroom + WC (unless genuinely separate rooms)`;

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

    // Post-process: Remove duplicate rooms
    const seenNames = new Set<string>();
    const originalCount = claudeData.rooms.length;
    claudeData.rooms = claudeData.rooms.filter((room: any) => {
      // Normalize room name for comparison (lowercase, remove non-alphanumeric)
      const normalized = room.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (seenNames.has(normalized)) {
        console.warn(`⚠ Duplicate room detected and removed: ${room.name}`);
        return false;
      }

      seenNames.add(normalized);
      return true;
    });

    if (originalCount !== claudeData.rooms.length) {
      console.log(`✓ Removed ${originalCount - claudeData.rooms.length} duplicate room(s)`);
    }

    // ========================================================================
    // STAGE 3: Matching Algorithm - Connect Semantics to Geometry
    // ========================================================================
    console.log('\n--- STAGE 3: Matching Labels to Contours ---');

    let unifiedRooms;
    if (contours.length > 0) {
      unifiedRooms = matchRoomsToContours(claudeData.rooms, contours);
      console.log(`✓ Successfully matched ${unifiedRooms.length}/${claudeData.rooms.length} rooms`);

      // If matching failed for most rooms, use synthetic contours
      if (unifiedRooms.length < claudeData.rooms.length * 0.5) {
        console.warn('Matching rate too low, falling back to synthetic contours');
        unifiedRooms = generateSyntheticContours(claudeData.rooms);
      }
    } else {
      console.warn('No CV contours detected, using synthetic contours');
      unifiedRooms = generateSyntheticContours(claudeData.rooms);
    }

    // ========================================================================
    // STAGE 4: Agentic Verification - Determine Adjacency with AI Reasoning
    // ========================================================================
    console.log('\n--- STAGE 4: Agentic Adjacency Verification ---');

    let adjacency;
    try {
      adjacency = await determineAdjacencyWithAgent(unifiedRooms, CLAUDE_API_KEY);
      console.log(`✓ Agent determined ${adjacency.length} adjacency relationships`);

      // Fallback to geometric if agent returns nothing
      if (adjacency.length === 0 && unifiedRooms.length > 1) {
        console.warn('Agent returned no adjacencies, using geometric fallback');
        adjacency = detectAdjacencyGeometric(unifiedRooms);
      }
    } catch (error) {
      console.error('Agentic verification failed, using geometric fallback:', error);
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
