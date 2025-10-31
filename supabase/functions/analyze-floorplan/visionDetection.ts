/**
 * Computer Vision Module for Floorplan Room Boundary Detection
 * Using JSR-compatible libraries for Deno Deploy
 */

import { decodePNG } from 'jsr:@img/png@0.1/decode';

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
 * Decode base64 image data to raw pixel array
 */
async function decodeImage(imageData: string): Promise<{ pixels: Uint8Array; width: number; height: number } | null> {
  try {
    // Extract base64 data and format
    const base64Match = imageData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (!base64Match) {
      console.error('Invalid image data format');
      return null;
    }

    const [, format, base64Data] = base64Match;
    
    console.log(`  → Detected image format: ${format.toUpperCase()}`);
    
    // Currently only PNG is supported (JPEG causes issues with Deno Deploy dependencies)
    // Frontend now preserves PNG format to avoid conversion
    if (format !== 'png') {
      console.error(`⚠️  Unsupported format: ${format} - CV requires PNG. Frontend should preserve PNG format.`);
      return null;
    }

    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    console.log(`  → Image data size: ${bytes.length} bytes`);

    // Decode PNG
    console.log('  → Decoding PNG...');
    const pngResult = await decodePNG(bytes);
    const pixels = pngResult.body;
    const width = pngResult.header.width;
    const height = pngResult.header.height;

    console.log(`  → Final dimensions: ${width}x${height}px (${pixels.length} bytes)`);
    return {
      pixels,
      width,
      height
    };
  } catch (error) {
    console.error('Image decoding failed:', error);
    return null;
  }
}

/**
 * Convert RGBA to grayscale
 */
function toGrayscale(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // Standard grayscale conversion
    gray[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/**
 * Apply binary threshold (Otsu's method approximation)
 */
function binaryThreshold(gray: Uint8Array): Uint8Array {
  // Calculate histogram
  const histogram = new Array(256).fill(0);
  for (const value of gray) {
    histogram[value]++;
  }

  // Find optimal threshold using Otsu's method
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let maximum = 0;
  let threshold = 0;

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);

    if (between > maximum) {
      maximum = between;
      threshold = i;
    }
  }

  console.log(`  → Binary threshold: ${threshold}`);

  // Apply threshold
  const binary = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i] > threshold ? 255 : 0;
  }

  return binary;
}

/**
 * Edge detection on grayscale (before thresholding)
 * This preserves interior walls as edges, which would be lost in binary thresholding
 */
function detectEdgesGrayscale(gray: Uint8Array, width: number, height: number): Uint8Array {
  const edges = new Uint8Array(gray.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // Sobel kernels (horizontal and vertical)
      const gx =
        -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)];

      const gy =
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      // Lower threshold to catch interior walls (gray lines)
      edges[idx] = magnitude > 30 ? 255 : 0;
    }
  }

  return edges;
}

/**
 * Morphological dilation to thicken walls
 * This ensures walls form complete separators between rooms
 */
function dilate(image: Uint8Array, width: number, height: number, iterations: number = 2): Uint8Array {
  let current = new Uint8Array(image);

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Uint8Array(current.length);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // If current pixel or any 4-neighbor is white, make it white
        const hasWhiteNeighbor =
          current[idx] === 255 ||
          current[idx - 1] === 255 ||
          current[idx + 1] === 255 ||
          current[idx - width] === 255 ||
          current[idx + width] === 255;

        next[idx] = hasWhiteNeighbor ? 255 : 0;
      }
    }

    current = next;
  }

  return current;
}

/**
 * Invert image: black → white, white → black
 */
function invert(image: Uint8Array): Uint8Array {
  const inverted = new Uint8Array(image.length);
  for (let i = 0; i < image.length; i++) {
    inverted[i] = 255 - image[i];
  }
  return inverted;
}

/**
 * Find connected components using flood fill
 */
function findConnectedComponents(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea: number = 5000
): RoomContour[] {
  const visited = new Uint8Array(binary.length);
  const components: RoomContour[] = [];

  function floodFill(startX: number, startY: number): Array<{x: number; y: number}> {
    const pixels: Array<{x: number; y: number}> = [];
    const stack: Array<{x: number; y: number}> = [{x: startX, y: startY}];

    while (stack.length > 0) {
      const {x, y} = stack.pop()!;
      const idx = y * width + x;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited[idx] || binary[idx] === 0) continue;

      visited[idx] = 1;
      pixels.push({x, y});

      // 4-connectivity
      stack.push({x: x + 1, y});
      stack.push({x: x - 1, y});
      stack.push({x, y: y + 1});
      stack.push({x, y: y - 1});
    }

    return pixels;
  }

  // Find components
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 255 && !visited[idx]) {
        const pixels = floodFill(x, y);

        if (pixels.length >= minArea) {
          // Calculate bounding box
          let minX = width, maxX = 0, minY = height, maxY = 0;
          let sumX = 0, sumY = 0;

          for (const p of pixels) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
            sumX += p.x;
            sumY += p.y;
          }

          components.push({
            bbox: {
              x: minX,
              y: minY,
              width: maxX - minX,
              height: maxY - minY
            },
            centroid: {
              x: sumX / pixels.length,
              y: sumY / pixels.length
            },
            area: pixels.length,
            points: pixels.slice(0, 100) // Keep first 100 points for reference
          });
        }
      }
    }
  }

  return components;
}

/**
 * Main function to detect room boundaries in a floorplan image
 */
export async function detectRoomBoundaries(imageData: string): Promise<RoomContour[]> {
  console.log('🔍 Starting computer vision room boundary detection (Deno-native)...');

  try {
    // Decode image
    const decoded = await decodeImage(imageData);
    if (!decoded) {
      console.error('⚠️  Image decoding failed');
      return [];
    }

    const { pixels, width, height } = decoded;

    // Convert to grayscale
    console.log('  → Converting to grayscale...');
    const gray = toGrayscale(pixels, width, height);

    // WALL-FIRST APPROACH: Detect edges on grayscale BEFORE thresholding
    // This preserves interior walls (gray lines) as edges
    console.log('  → Detecting walls (edge detection on grayscale)...');
    const wallEdges = detectEdgesGrayscale(gray, width, height);

    // Thicken walls to ensure they separate rooms completely
    console.log('  → Enhancing walls (morphological dilation)...');
    const thickWalls = dilate(wallEdges, width, height, 3); // 3 iterations for thick separation

    // Invert: walls become black, rooms become white
    console.log('  → Inverting (walls=black, rooms=white)...');
    const inverted = invert(thickWalls);

    // Find connected components (each white region = one room)
    console.log('  → Finding room regions (connected components)...');
    const minArea = Math.floor((width * height) * 0.01); // At least 1% of image
    const components = findConnectedComponents(inverted, width, height, minArea);

    console.log(`  → Found ${components.length} potential room regions (before filtering)`);

    // Filter components by reasonable room size
    const filtered = components.filter(c => {
      const area = c.bbox.width * c.bbox.height;
      const imageArea = width * height;
      const areaRatio = area / imageArea;

      // Room should be between 2% and 50% of image
      // Lower bound: filters out noise and labels
      // Upper bound: filters out entire-floorplan detections
      const sizeValid = areaRatio >= 0.02 && areaRatio <= 0.5;

      // Aspect ratio check: rooms shouldn't be too elongated
      const aspectRatio = c.bbox.width / c.bbox.height;
      const aspectValid = aspectRatio >= 0.2 && aspectRatio <= 5.0; // Allow 5:1 ratio max

      return sizeValid && aspectValid;
    });

    console.log(`  → Retained ${filtered.length} components after size/aspect filtering`);

    if (filtered.length === 0) {
      console.log('⚠️  No valid room boundaries detected - image may be too dark/light or low quality');
      return [];
    }

    console.log(`✅ Computer vision detected ${filtered.length} valid room boundaries`);
    return filtered;

  } catch (error) {
    console.error('❌ Computer vision error:', error);
    return [];
  }
}
