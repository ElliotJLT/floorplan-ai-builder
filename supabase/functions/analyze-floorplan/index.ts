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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Analyzing floorplan with AI...');

    const systemPrompt = `You are a floorplan analysis expert. Analyze the provided 2D floorplan image and extract precise room information.

CRITICAL INSTRUCTIONS:
1. Extract ALL room measurements from text labels (e.g., "7.16m x 3.30m")
2. Identify room names (Entrance Hall, Kitchen, Bedroom, etc.)
3. Calculate 3D positions based on spatial relationships
4. Use coordinate system: X = left-to-right, Z = front-to-back, Y = 0 (floor level)
5. Position values are CENTER points of each room in meters
6. Start with Entrance Hall at origin [0, 0, 0]
7. Calculate adjacent room positions using: newX = baseX ± (baseWidth/2 + newWidth/2 + 0.1)
8. Wall thickness = 0.1m (add between adjacent rooms)
9. All measurements in METERS

OUTPUT REQUIREMENTS:
Return a JSON object with this exact structure:
{
  "id": "extracted-address",
  "address": "full address from image",
  "totalAreaSqFt": number (sum all room areas in sq ft),
  "totalAreaSqM": number (sum all room areas in sq m),
  "ceilingHeight": 2.4,
  "rooms": [
    {
      "id": "room-name-lowercase",
      "name": "Room Name",
      "position": [x, 0, z],
      "dimensions": [width, 2.4, depth],
      "color": "#hexcolor",
      "originalMeasurements": {
        "width": "X.XXm",
        "depth": "X.XXm"
      }
    }
  ]
}

VALIDATION RULES:
- Sum of room areas must match declared total area
- No rooms should overlap
- All dimensions must be positive numbers
- Position first room at [0, 0, 0]
- Calculate other positions based on adjacency`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: systemPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" }
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
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing...');
    
    const floorplanData = JSON.parse(content);
    
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
