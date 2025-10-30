/**
 * Computer Vision Module for Floorplan Room Boundary Detection
 *
 * This module uses canvas-based image processing to detect room boundaries
 * in floorplan images without relying on semantic understanding.
 *
 * Approach:
 * 1. Convert image to grayscale
 * 2. Apply thresholding to create binary image
 * 3. Find connected components (room regions)
 * 4. Extract bounding boxes and centroids
 */

import { createCanvas, loadImage } from "https://deno.land/x/canvas@v1.4.1/mod.ts";

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
 * Convert base64 image data to ImageData
 */
async function base64ToImageData(base64: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  // Remove data URL prefix if present
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;

  // Load image
  const img = await loadImage(`data:image/png;base64,${base64Data}`);

  // Create canvas and get image data
  const canvas = createCanvas(img.width(), img.height());
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return {
    data: imageData.data,
    width: canvas.width,
    height: canvas.height
  };
}

/**
 * Convert RGBA image data to grayscale
 */
function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Standard grayscale conversion
    gray[i] = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return gray;
}

/**
 * Apply Otsu's thresholding to create binary image
 */
function otsuThreshold(gray: Uint8ClampedArray): { binary: Uint8ClampedArray; threshold: number } {
  // Calculate histogram
  const histogram = new Array(256).fill(0);
  for (const pixel of gray) {
    histogram[pixel]++;
  }

  // Calculate total pixels
  const total = gray.length;

  // Find optimal threshold using Otsu's method
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;

    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  // Apply threshold
  const binary = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i] > threshold ? 255 : 0;
  }

  return { binary, threshold };
}

/**
 * Find connected components using flood fill
 */
function findConnectedComponents(
  binary: Uint8ClampedArray,
  width: number,
  height: number
): Array<{ pixels: Array<{x: number; y: number}>; bbox: RoomContour['bbox'] }> {
  const visited = new Uint8Array(width * height);
  const components: Array<{ pixels: Array<{x: number; y: number}>; bbox: RoomContour['bbox'] }> = [];

  function floodFill(startX: number, startY: number): Array<{x: number; y: number}> {
    const pixels: Array<{x: number; y: number}> = [];
    const stack = [{x: startX, y: startY}];

    while (stack.length > 0) {
      const {x, y} = stack.pop()!;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;
      if (visited[idx] || binary[idx] === 0) continue;

      visited[idx] = 1;
      pixels.push({x, y});

      // Add 4-connected neighbors
      stack.push({x: x + 1, y});
      stack.push({x: x - 1, y});
      stack.push({x, y: y + 1});
      stack.push({x, y: y - 1});
    }

    return pixels;
  }

  // Find all components
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!visited[idx] && binary[idx] === 255) {
        const pixels = floodFill(x, y);

        if (pixels.length > 0) {
          // Calculate bounding box
          let minX = width, maxX = 0, minY = height, maxY = 0;
          for (const p of pixels) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }

          components.push({
            pixels,
            bbox: {
              x: minX,
              y: minY,
              width: maxX - minX + 1,
              height: maxY - minY + 1
            }
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
  console.log('Starting computer vision room detection...');

  try {
    // Step 1: Load and convert image
    const { data, width, height } = await base64ToImageData(imageData);
    console.log(`Image loaded: ${width}x${height}`);

    // Step 2: Convert to grayscale
    const gray = toGrayscale(data, width, height);
    console.log('Converted to grayscale');

    // Step 3: Apply thresholding
    const { binary, threshold } = otsuThreshold(gray);
    console.log(`Applied Otsu threshold: ${threshold}`);

    // Step 4: Find connected components
    const components = findConnectedComponents(binary, width, height);
    console.log(`Found ${components.length} connected components`);

    // Step 5: Filter and convert to room contours
    const imageArea = width * height;
    const roomContours: RoomContour[] = [];

    for (const component of components) {
      const area = component.pixels.length;

      // Filter: room must be 0.5% - 40% of image area
      // This removes noise (too small) and the entire floorplan border (too large)
      if (area < imageArea * 0.005 || area > imageArea * 0.4) {
        continue;
      }

      // Filter: aspect ratio should be reasonable (not too thin)
      const aspectRatio = component.bbox.width / component.bbox.height;
      if (aspectRatio < 0.1 || aspectRatio > 10) {
        continue; // Likely a line or artifact
      }

      // Calculate centroid
      let sumX = 0, sumY = 0;
      for (const p of component.pixels) {
        sumX += p.x;
        sumY += p.y;
      }

      const centroid = {
        x: Math.floor(sumX / component.pixels.length),
        y: Math.floor(sumY / component.pixels.length)
      };

      roomContours.push({
        bbox: component.bbox,
        centroid,
        area,
        points: component.pixels.length < 1000 ? component.pixels : undefined // Only store points for small regions
      });
    }

    // Sort by area (largest first) for better matching
    roomContours.sort((a, b) => b.area - a.area);

    console.log(`Detected ${roomContours.length} valid room boundaries`);
    return roomContours;

  } catch (error) {
    console.error('Error in vision detection:', error);
    // Return empty array on error - system can fall back to Claude-only mode
    return [];
  }
}
