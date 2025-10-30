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

    const systemPrompt = `You are an expert architectural analyst specializing in 2D floorplan interpretation and 3D spatial reconstruction.

ANALYSIS WORKFLOW:
Step 1: MEASUREMENT EXTRACTION
- Identify all room labels and their dimensions (e.g., "7.16m x 3.30m")
- Extract room names (Kitchen, Bedroom, Living Room, etc.)
- Note the total property area if labeled
- Record ceiling height if mentioned

Step 2: SPATIAL RELATIONSHIP MAPPING
- Identify which rooms share walls (adjacency)
- Locate doorways and openings between rooms
- Determine the general layout pattern (linear, L-shaped, etc.)
- Note the entry point (usually Entrance Hall or Reception)

Step 3: 3D COORDINATE CALCULATION
Coordinate system: X = left-to-right, Y = vertical (height), Z = front-to-back (depth)
- Start with the entrance/reception room at origin [0, 0, 0]
- For each adjacent room, calculate position using:
  * If room is to the RIGHT: newX = baseX + (baseWidth/2) + 0.1 + (newWidth/2)
  * If room is to the LEFT: newX = baseX - (baseWidth/2) - 0.1 - (newWidth/2)
  * If room is BEHIND: newZ = baseZ + (baseDepth/2) + 0.1 + (newDepth/2)
  * If room is IN FRONT: newZ = baseZ - (baseDepth/2) - 0.1 - (newDepth/2)
  * Wall thickness = 0.1m (always add between rooms)
- Ensure connected rooms actually touch at their shared walls

Step 4: VALIDATION
- Verify no rooms overlap
- Check that total area matches sum of room areas
- Confirm all adjacent rooms share wall coordinates

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no explanation):
{
  "id": "address-or-property-name",
  "address": "Full address from image",
  "totalAreaSqFt": <sum of all room areas in sq ft>,
  "totalAreaSqM": <sum of all room areas in sq m>,
  "ceilingHeight": 2.4,
  "rooms": [
    {
      "id": "room-name-lowercase",
      "name": "Room Name",
      "position": [x, 0, z],
      "dimensions": [width, 2.4, depth],
      "color": "#<hex-color>",
      "originalMeasurements": {
        "width": "X.XXm",
        "depth": "X.XXm"
      }
    }
  ]
}

IMPORTANT RULES:
- All measurements in METERS
- Position values are CENTER points of rooms
- Y-axis is always 0 for floor level
- Room height is always ceilingHeight (default 2.4m)
- Use distinct colors for each room
- Ensure rooms form a connected layout (no floating rooms)`;

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
