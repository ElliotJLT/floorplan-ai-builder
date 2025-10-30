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

    const systemPrompt = `You are an expert at analyzing 2D architectural floorplans.

Your task: Extract room names, dimensions, total area, and identify the entry room.

INSTRUCTIONS:
1. Identify all rooms with their dimensions
   - Measure width and depth in meters from the floorplan
   - Convert from feet/inches if needed (1 foot = 0.3048m)
   - Include original measurements as shown on plan

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
- entryRoomId must match one of the room IDs`;

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
      totalArea: floorplanData.totalAreaSqM,
      entryRoom: floorplanData.entryRoomId
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
