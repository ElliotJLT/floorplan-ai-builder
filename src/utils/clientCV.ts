/**
 * Client-Side Computer Vision for Floorplan Room Boundary Detection
 * Runs in browser using Canvas API - 100% reliable, no backend dependencies
 */

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
 * Convert image to grayscale using Canvas API
 */
function toGrayscale(imageData: ImageData): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(imageData.width * imageData.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  
  return gray;
}

/**
 * Apply binary threshold using Otsu's method
 */
function binaryThreshold(gray: Uint8ClampedArray): Uint8ClampedArray {
  const histogram = new Array(256).fill(0);
  for (const value of gray) {
    histogram[value]++;
  }

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

  console.log(`Binary threshold: ${threshold}`);

  const binary = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i] > threshold ? 255 : 0;
  }

  return binary;
}

/**
 * Morphological closing operation to connect gaps in walls
 */
function morphologicalClose(binary: Uint8ClampedArray, width: number, height: number, kernelSize: number = 3): Uint8ClampedArray {
  const dilated = morphologicalDilate(binary, width, height, kernelSize);
  const closed = morphologicalErode(dilated, width, height, kernelSize);
  return closed;
}

function morphologicalDilate(binary: Uint8ClampedArray, width: number, height: number, kernelSize: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(binary.length);
  const offset = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxVal = 0;
      
      for (let ky = -offset; ky <= offset; ky++) {
        for (let kx = -offset; kx <= offset; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            maxVal = Math.max(maxVal, binary[ny * width + nx]);
          }
        }
      }
      
      result[y * width + x] = maxVal;
    }
  }
  
  return result;
}

function morphologicalErode(binary: Uint8ClampedArray, width: number, height: number, kernelSize: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(binary.length);
  const offset = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minVal = 255;
      
      for (let ky = -offset; ky <= offset; ky++) {
        for (let kx = -offset; kx <= offset; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            minVal = Math.min(minVal, binary[ny * width + nx]);
          }
        }
      }
      
      result[y * width + x] = minVal;
    }
  }
  
  return result;
}

/**
 * Enhanced edge detection with multiple methods
 */
function detectEdges(binary: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(binary.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel operator
      const gx = 
        -binary[(y - 1) * width + (x - 1)] + binary[(y - 1) * width + (x + 1)] +
        -2 * binary[y * width + (x - 1)] + 2 * binary[y * width + (x + 1)] +
        -binary[(y + 1) * width + (x - 1)] + binary[(y + 1) * width + (x + 1)];

      const gy =
        -binary[(y - 1) * width + (x - 1)] - 2 * binary[(y - 1) * width + x] - binary[(y - 1) * width + (x + 1)] +
        binary[(y + 1) * width + (x - 1)] + 2 * binary[(y + 1) * width + x] + binary[(y + 1) * width + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      
      // Lower threshold to detect more walls (including interior walls)
      edges[idx] = magnitude > 60 ? 255 : 0;
    }
  }

  return edges;
}

/**
 * Find connected components using flood fill
 */
function findConnectedComponents(
  binary: Uint8ClampedArray,
  width: number,
  height: number,
  minArea: number
): RoomContour[] {
  const visited = new Uint8ClampedArray(binary.length);
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

      stack.push({x: x + 1, y});
      stack.push({x: x - 1, y});
      stack.push({x, y: y + 1});
      stack.push({x, y: y - 1});
    }

    return pixels;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 255 && !visited[idx]) {
        const pixels = floodFill(x, y);

        if (pixels.length >= minArea) {
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
            points: pixels.slice(0, 100)
          });
        }
      }
    }
  }

  return components;
}

/**
 * Main function: Detect room boundaries in floorplan image
 * Returns contours and a visual overlay canvas
 */
export async function detectRoomBoundaries(imageDataUrl: string): Promise<{
  contours: RoomContour[];
  overlayCanvas: HTMLCanvasElement;
}> {
  console.log('🔍 Starting client-side CV...');

  // Load image
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = imageDataUrl;
  });

  // Create canvas and get image data
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  console.log(`Image: ${canvas.width}x${canvas.height}px`);

  // CV pipeline
  const gray = toGrayscale(imageData);
  const binary = binaryThreshold(gray);
  
  // Apply morphological closing to connect wall segments
  console.log('Applying morphological operations...');
  const closed = morphologicalClose(binary, canvas.width, canvas.height, 3);
  
  const edges = detectEdges(closed, canvas.width, canvas.height);
  
  const minArea = Math.floor((canvas.width * canvas.height) * 0.003); // More sensitive (0.3% instead of 0.5%)
  const components = findConnectedComponents(edges, canvas.width, canvas.height, minArea);
  
  console.log(`Found ${components.length} raw components`);

  // Filter by reasonable size and aspect ratio with detailed logging
  const imageArea = canvas.width * canvas.height;
  const filtered = components.filter(c => {
    const area = c.bbox.width * c.bbox.height;
    const areaRatio = area / imageArea;
    const aspectRatio = Math.max(c.bbox.width, c.bbox.height) / Math.min(c.bbox.width, c.bbox.height);
    
    const sizeOk = areaRatio >= 0.005 && areaRatio <= 0.7; // More lenient: 0.5% to 70%
    const aspectOk = aspectRatio < 15; // More lenient aspect ratio
    
    if (!sizeOk || !aspectOk) {
      console.log(`Filtered out: area=${(areaRatio * 100).toFixed(1)}% (${sizeOk ? 'OK' : 'FAIL'}), aspect=${aspectRatio.toFixed(1)} (${aspectOk ? 'OK' : 'FAIL'})`);
    }
    
    return sizeOk && aspectOk;
  });

  console.log(`✅ Detected ${filtered.length} valid room boundaries`);

  // Create visual overlay
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  const overlayCtx = overlayCanvas.getContext('2d')!;
  
  // Draw detected boundaries
  overlayCtx.strokeStyle = '#00ff00';
  overlayCtx.lineWidth = 3;
  filtered.forEach((contour, i) => {
    overlayCtx.strokeRect(
      contour.bbox.x,
      contour.bbox.y,
      contour.bbox.width,
      contour.bbox.height
    );
    
    // Draw label
    overlayCtx.fillStyle = '#00ff00';
    overlayCtx.font = '16px sans-serif';
    overlayCtx.fillText(
      `Room ${i + 1}`,
      contour.bbox.x + 5,
      contour.bbox.y + 20
    );
  });

  return {
    contours: filtered,
    overlayCanvas
  };
}
