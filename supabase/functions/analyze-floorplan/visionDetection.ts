/**
 * Computer Vision Module for Floorplan Room Boundary Detection
 *
 * Deno-native implementation using pure JavaScript/WASM libraries
 * Compatible with Deno Deploy (Supabase Edge Functions)
 */

// Import Deno-compatible image decoders
import { decode as decodePng } from 'https://deno.land/x/pngs@0.1.1/mod.ts';
import { decode as decodeJpeg } from 'https://deno.land/x/jpeg@v1.0.1/mod.ts';

export interface RoomContour {
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
  area: number;
  points?: Array<{x: number; y: number}>;
}

/**
 * Decode base64 image data to raw pixel data using Deno-native libraries
 */
async function decodeImage(base64Data: string): Promise<{
  data: Uint8Array;
  width: number;
  height: number;
}> {
  try {
    // Remove data URL prefix if present
    const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

    // Detect image format from data URL prefix
    const isPng = base64Data.includes('image/png');
    const isJpeg = base64Data.includes('image/jpeg') || base64Data.includes('image/jpg');

    if (!isPng && !isJpeg) {
      throw new Error('Unsupported image format (must be PNG or JPEG)');
    }

    // Decode base64 to binary
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    console.log(`Decoding ${isPng ? 'PNG' : 'JPEG'} image (${bytes.length} bytes)...`);

    // Decode image based on format
    let imageData: { image: Uint8Array; width: number; height: number };

    if (isPng) {
      imageData = decodePng(bytes);
    } else {
      // JPEG decoder returns { data, width, height }
      const jpegData = decodeJpeg(bytes);
      imageData = {
        image: jpegData.data,
        width: jpegData.width,
        height: jpegData.height
      };
    }

    return {
      data: imageData.image,
      width: imageData.width,
      height: imageData.height
    };
  } catch (error) {
    console.error('Image decode error:', error);
    throw new Error(`Failed to decode image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Convert RGBA image to grayscale
 */
function toGrayscale(rgba: Uint8Array): Uint8Array {
  const gray = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < gray.length; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    // Standard grayscale conversion
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/**
 * Apply binary threshold to grayscale image
 */
function threshold(gray: Uint8Array, thresholdValue: number = 200): Uint8Array {
  const binary = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i] > thresholdValue ? 255 : 0;
  }
  return binary;
}

/**
 * Simple edge detection using Sobel operator
 */
function detectEdges(
  gray: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const edges = new Uint8Array(gray.length);

  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;

      // Apply Sobel kernels
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += gray[idx] * sobelX[kernelIdx];
          gy += gray[idx] * sobelY[kernelIdx];
        }
      }

      // Calculate gradient magnitude
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * width + x] = Math.min(255, magnitude);
    }
  }

  return edges;
}

/**
 * Find connected components using flood fill
 */
function findConnectedComponents(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea: number = 1000
): Array<Array<{x: number; y: number}>> {
  const visited = new Uint8Array(binary.length);
  const components: Array<Array<{x: number; y: number}>> = [];

  function floodFill(startX: number, startY: number): Array<{x: number; y: number}> {
    const stack: Array<{x: number; y: number}> = [{x: startX, y: startY}];
    const component: Array<{x: number; y: number}> = [];

    while (stack.length > 0) {
      const {x, y} = stack.pop()!;
      const idx = y * width + x;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited[idx] === 1) continue;
      if (binary[idx] === 0) continue; // Not a white pixel

      visited[idx] = 1;
      component.push({x, y});

      // Check 4-connected neighbors
      stack.push({x: x + 1, y});
      stack.push({x: x - 1, y});
      stack.push({x, y: y + 1});
      stack.push({x, y: y - 1});
    }

    return component;
  }

  // Find all connected components
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 255 && visited[idx] === 0) {
        const component = floodFill(x, y);
        if (component.length >= minArea) {
          components.push(component);
        }
      }
    }
  }

  return components;
}

/**
 * Calculate bounding box and centroid from a set of points
 */
function calculateBoundingBox(points: Array<{x: number; y: number}>): {
  bbox: {x: number; y: number; width: number; height: number};
  centroid: {x: number; y: number};
  area: number;
} {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let sumX = 0, sumY = 0;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    sumX += point.x;
    sumY += point.y;
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  return {
    bbox: {x: minX, y: minY, width, height},
    centroid: {
      x: Math.round(sumX / points.length),
      y: Math.round(sumY / points.length)
    },
    area: points.length
  };
}

/**
 * Main function to detect room boundaries in a floorplan image
 * Deno-native implementation using pure JavaScript/WASM libraries
 */
export async function detectRoomBoundaries(imageData: string): Promise<RoomContour[]> {
  try {
    console.log('🔍 Starting computer vision room boundary detection (Deno-native)...');

    // Step 1: Decode image using Deno-compatible libraries
    console.log('  → Decoding image data...');
    const {data: rgba, width, height} = await decodeImage(imageData);
    console.log(`  → Image size: ${width}x${height}px (${rgba.length} bytes)`);

    // Step 2: Convert to grayscale
    console.log('  → Converting to grayscale...');
    const gray = toGrayscale(rgba);

    // Step 3: Apply threshold to get binary image
    console.log('  → Applying binary threshold...');
    const binary = threshold(gray, 200);

    // Step 4: Detect edges (helps identify room boundaries)
    console.log('  → Detecting edges...');
    const edges = detectEdges(gray, width, height);

    // Step 5: Find connected components (potential rooms)
    console.log('  → Finding connected components...');
    const minArea = (width * height) / 100; // Rooms should be at least 1% of image
    const components = findConnectedComponents(binary, width, height, minArea);
    console.log(`  → Found ${components.length} potential room regions`);

    // Step 6: Convert components to contours
    const contours: RoomContour[] = [];
    for (const component of components) {
      const {bbox, centroid, area} = calculateBoundingBox(component);

      // Filter by aspect ratio (rooms are typically not too thin)
      const aspectRatio = bbox.width / bbox.height;
      if (aspectRatio < 0.2 || aspectRatio > 5) {
        continue; // Skip very thin regions
      }

      // Filter by size (rooms should be reasonable size)
      if (bbox.width < 50 || bbox.height < 50) {
        continue; // Too small to be a room
      }

      contours.push({
        bbox,
        centroid,
        area,
        points: component.length > 100 ? component.slice(0, 100) : component // Limit points for performance
      });
    }

    console.log(`✅ Computer vision detected ${contours.length} valid room boundaries`);

    if (contours.length === 0) {
      console.warn('⚠️  No room boundaries detected - image may be too dark/light or lack clear room divisions');
      console.log('  → Falling back to Claude AI-only mode with synthetic contours');
    }

    return contours;

  } catch (error) {
    console.error('❌ Computer vision detection failed:', error);
    console.log('  → Error details:', error instanceof Error ? error.message : String(error));
    console.log('  → Falling back to Claude AI-only mode with synthetic contours');
    return []; // Fallback to synthetic contours
  }
}
