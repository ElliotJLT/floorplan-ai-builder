import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    console.log('Analyzing floorplan with Claude AI...');

    const systemPrompt = `You are an expert architectural analyst specializing in 2D floorplan interpretation.

YOUR TASK: Extract room data and spatial relationships (NOT precise coordinates).

STEP 1: MEASUREMENT EXTRACTION
- Identify all room labels and dimensions (e.g., "7.16m x 3.30m")
- Extract room names (Kitchen, Bedroom, Living Room, etc.)
- Note total property area if labeled
- Record ceiling height if mentioned (default 2.4m)

STEP 2: SPATIAL RELATIONSHIP MAPPING (CRITICAL!)
For each pair of rooms that share a wall:
- Identify which rooms are adjacent
- Determine the direction: is room2 NORTH/SOUTH/EAST/WEST of room1?
- Use the floorplan orientation to determine directions:
  * NORTH = towards top of image
  * SOUTH = towards bottom of image  
  * EAST = towards right of image
  * WEST = towards left of image

STEP 3: IDENTIFY ENTRY ROOM
- Determine which room is the entrance/entry point (usually "Entrance Hall" or "Reception")
- This will be the starting point for layout calculation

OUTPUT FORMAT (CRITICAL - Return ONLY valid JSON, no markdown):
{
  "id": "address-slug",
  "address": "Full address from image",
  "totalAreaSqFt": <number>,
  "totalAreaSqM": <number>,
  "ceilingHeight": 2.4,
  "entryRoomId": "entrance-hall",
  "rooms": [
    {
      "id": "room-name-lowercase",
      "name": "Room Name",
      "width": 7.16,
      "depth": 3.30,
      "color": "#hex-color",
      "originalMeasurements": {
        "width": "7.16m",
        "depth": "3.30m"
      }
    }
  ],
  "adjacency": [
    {
      "room1": "entrance-hall",
      "room2": "living-room",
      "edge": "west"
    },
    {
      "room1": "living-room",
      "room2": "kitchen",
      "edge": "north"
    }
  ]
}

IMPORTANT RULES:
- All measurements in METERS
- width = X-axis (left-right), depth = Z-axis (front-back)
- Use distinct hex colors for each room
- adjacency MUST include ALL pairs of rooms that share a wall
- edge directions: "north", "south", "east", "west" (lowercase)
- entryRoomId MUST match one of the room IDs`;

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

    console.log('Claude response received, parsing...');
    
    // Extract JSON from potential markdown code blocks
    let jsonText = content;
    if (content.includes('```json')) {
      jsonText = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonText = content.split('```')[1].split('```')[0].trim();
    }
    
    const floorplanData = JSON.parse(jsonText);
    
    console.log('Floorplan analysis complete:', {
      rooms: floorplanData.rooms?.length,
      totalArea: floorplanData.totalAreaSqM
    });

    return new Response(
      JSON.stringify(floorplanData),
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
