import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Text, Line } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Home, Move, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Room as RoomType, FloorplanData } from "@/types/floorplan";
import { validateLayout } from "@/utils/floorplanLayout";
import { toast } from "sonner";

// Collision and snapping constants
const WALL_THICKNESS = 0.1;
const SNAP_THRESHOLD = 0.3; // meters
const COLLISION_TOLERANCE = 0.05; // Allow slight overlap for walls

/**
 * Check if two rooms would collide at given position
 */
const checkCollision = (
  roomDimensions: [number, number, number],
  newPosition: [number, number, number],
  otherRoom: RoomType
): boolean => {
  const [w1, , d1] = roomDimensions;
  const [x1, , z1] = newPosition;

  const [w2, , d2] = otherRoom.dimensions;
  const [x2, , z2] = otherRoom.position;

  // Calculate bounding boxes
  const box1 = {
    left: x1 - w1 / 2,
    right: x1 + w1 / 2,
    back: z1 - d1 / 2,
    front: z1 + d1 / 2
  };

  const box2 = {
    left: x2 - w2 / 2,
    right: x2 + w2 / 2,
    back: z2 - d2 / 2,
    front: z2 + d2 / 2
  };

  // Check for overlap with tolerance for wall thickness
  const xOverlap = box1.left < box2.right - COLLISION_TOLERANCE &&
                   box1.right > box2.left + COLLISION_TOLERANCE;
  const zOverlap = box1.back < box2.front - COLLISION_TOLERANCE &&
                   box1.front > box2.back + COLLISION_TOLERANCE;

  return xOverlap && zOverlap;
};

/**
 * Find nearest wall snap position
 */
const findWallSnap = (
  roomDimensions: [number, number, number],
  newPosition: [number, number, number],
  otherRoom: RoomType
): [number, number, number] | null => {
  const [w1, , d1] = roomDimensions;
  const [x1, , z1] = newPosition;

  const [w2, , d2] = otherRoom.dimensions;
  const [x2, , z2] = otherRoom.position;

  // Calculate distances to all four walls
  const snaps: Array<{ pos: [number, number, number]; distance: number }> = [];

  // North wall (other room's front edge)
  const northZ = z2 + d2 / 2 + d1 / 2 + WALL_THICKNESS;
  const northDist = Math.abs(z1 - northZ);
  if (northDist < SNAP_THRESHOLD && Math.abs(x1 - x2) < (w1 + w2) / 2) {
    snaps.push({ pos: [x1, 0, northZ], distance: northDist });
  }

  // South wall (other room's back edge)
  const southZ = z2 - d2 / 2 - d1 / 2 - WALL_THICKNESS;
  const southDist = Math.abs(z1 - southZ);
  if (southDist < SNAP_THRESHOLD && Math.abs(x1 - x2) < (w1 + w2) / 2) {
    snaps.push({ pos: [x1, 0, southZ], distance: southDist });
  }

  // East wall (other room's right edge)
  const eastX = x2 + w2 / 2 + w1 / 2 + WALL_THICKNESS;
  const eastDist = Math.abs(x1 - eastX);
  if (eastDist < SNAP_THRESHOLD && Math.abs(z1 - z2) < (d1 + d2) / 2) {
    snaps.push({ pos: [eastX, 0, z1], distance: eastDist });
  }

  // West wall (other room's left edge)
  const westX = x2 - w2 / 2 - w1 / 2 - WALL_THICKNESS;
  const westDist = Math.abs(x1 - westX);
  if (westDist < SNAP_THRESHOLD && Math.abs(z1 - z2) < (d1 + d2) / 2) {
    snaps.push({ pos: [westX, 0, z1], distance: westDist });
  }

  // Return the closest snap position
  if (snaps.length > 0) {
    snaps.sort((a, b) => a.distance - b.distance);
    return snaps[0].pos;
  }

  return null;
};

const Room3D = ({
  room,
  isSelected,
  onSelect,
  onDragEnd,
  isDragging,
  allRooms
}: {
  room: RoomType;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (newPosition: [number, number, number]) => void;
  isDragging: boolean;
  allRooms: RoomType[];
}) => {
  const [hovered, setHovered] = useState(false);
  const [dragStart, setDragStart] = useState<THREE.Vector3 | null>(null);
  const [collision, setCollision] = useState(false);
  const [snapped, setSnapped] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const [width, height, depth] = room.dimensions;

  const handlePointerDown = (e: any) => {
    if (!isSelected) {
      onSelect();
      return;
    }
    e.stopPropagation();
    const point = e.point.clone();
    point.y = 0; // Keep on ground plane
    setDragStart(point.sub(new THREE.Vector3(...room.position)));
  };

  const handlePointerMove = (e: any) => {
    if (!dragStart || !isSelected) return;
    e.stopPropagation();

    const point = e.point.clone();
    point.y = 0;
    let newPos = point.sub(dragStart);

    // Snap to grid (0.1m)
    const snapSize = 0.1;
    newPos.x = Math.round(newPos.x / snapSize) * snapSize;
    newPos.z = Math.round(newPos.z / snapSize) * snapSize;

    const candidatePos: [number, number, number] = [newPos.x, 0, newPos.z];

    // Get other rooms (excluding this one)
    const otherRooms = allRooms.filter(r => r.id !== room.id);

    // Check for collisions
    let hasCollision = false;
    for (const otherRoom of otherRooms) {
      if (checkCollision(room.dimensions, candidatePos, otherRoom)) {
        hasCollision = true;
        break;
      }
    }

    // If collision detected, don't move
    if (hasCollision) {
      setCollision(true);
      setSnapped(false);
      return;
    }

    setCollision(false);

    // Check for wall snapping
    let snappedPos: [number, number, number] | null = null;
    for (const otherRoom of otherRooms) {
      const snap = findWallSnap(room.dimensions, candidatePos, otherRoom);
      if (snap) {
        // Verify snap position doesn't cause collision
        const wouldCollide = otherRooms.some(r =>
          r.id !== otherRoom.id && checkCollision(room.dimensions, snap, r)
        );
        if (!wouldCollide) {
          snappedPos = snap;
          break;
        }
      }
    }

    if (snappedPos) {
      setSnapped(true);
      onDragEnd(snappedPos);
    } else {
      setSnapped(false);
      onDragEnd(candidatePos);
    }
  };

  const handlePointerUp = () => {
    setDragStart(null);
    setCollision(false);
    setSnapped(false);
  };

  return (
    <group position={room.position}>
      {/* Floor */}
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={
            collision ? "#ef4444" : // Red for collision
            snapped ? "#10b981" : // Green for snap
            isSelected ? "#3b82f6" :
            hovered ? "#14b8a6" :
            room.color
          }
          side={THREE.DoubleSide}
          transparent
          opacity={isDragging ? 0.6 : 0.9}
        />
      </mesh>

      {/* Walls */}
      <mesh position={[0, height / 2, -depth / 2]}>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>
      
      <mesh position={[0, height / 2, depth / 2]}>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>
      
      <mesh position={[-width / 2, height / 2, 0]}>
        <boxGeometry args={[0.1, height, depth]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>
      
      <mesh position={[width / 2, height / 2, 0]}>
        <boxGeometry args={[0.1, height, depth]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>

      {/* Room label */}
      <Text
        position={[0, height + 0.3, 0]}
        fontSize={0.25}
        color="#334155"
        anchorX="center"
        anchorY="middle"
        maxWidth={width - 0.2}
      >
        {room.name}
      </Text>

      {/* Dimensions label */}
      <Text
        position={[0, height - 0.2, 0]}
        fontSize={0.12}
        color="#64748b"
        anchorX="center"
        anchorY="middle"
      >
        {width.toFixed(2)}m × {depth.toFixed(2)}m
      </Text>
    </group>
  );
};

interface FloorplanViewer3DProps {
  floorplanImage: string;
  floorplanData: FloorplanData;
  onBack: () => void;
  onUpdate: (data: FloorplanData) => void;
}

export const FloorplanViewer3D = ({ floorplanImage, floorplanData, onBack, onUpdate }: FloorplanViewer3DProps) => {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [localData, setLocalData] = useState(floorplanData);
  const [showValidation, setShowValidation] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const controlsRef = useRef<any>();

  const validation = validateLayout(localData);

  const handleReset = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  const selectedRoomData = selectedRoom ? localData.rooms.find(r => r.id === selectedRoom) : null;
  const editingRoomData = editingRoom ? localData.rooms.find(r => r.id === editingRoom) : null;

  const updateRoom = (roomId: string, updates: Partial<RoomType>) => {
    const updatedData = {
      ...localData,
      rooms: localData.rooms.map(room =>
        room.id === roomId ? { ...room, ...updates } : room
      )
    };
    setLocalData(updatedData);
    onUpdate(updatedData);
  };

  const rotateRoom = (roomId: string) => {
    const room = localData.rooms.find(r => r.id === roomId);
    if (!room) return;
    
    // Swap width and depth
    updateRoom(roomId, {
      dimensions: [room.dimensions[2], room.dimensions[1], room.dimensions[0]]
    });
    toast.success('Room rotated 90°');
  };

  return (
    <div className="relative w-full h-screen bg-slate-900">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-slate-900/90 to-transparent">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{floorplanData.address}</h2>
            <p className="text-sm text-slate-300">
              {floorplanData.rooms.filter(r => r.name.includes('Bedroom')).length} Bed Ground Floor Flat • {floorplanData.totalAreaSqFt} sq ft
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const validation = validateLayout(floorplanData);
                if (validation.isValid) {
                  toast.success('Layout is valid - no overlaps or significant gaps');
                } else {
                  const overlapDetails = validation.overlaps.map(o => `${o.room1} ↔ ${o.room2}`).join(', ');
                  const gapDetails = validation.gaps.map(g => `${g.room1} ↔ ${g.room2}`).join(', ');
                  
                  let message = 'Layout issues detected:\n';
                  if (validation.overlaps.length > 0) {
                    message += `\nOverlaps: ${overlapDetails}`;
                  }
                  if (validation.gaps.length > 0) {
                    message += `\nGaps: ${gapDetails}`;
                  }
                  
                  toast.error(message);
                }
                setShowValidation(!showValidation);
              }}
              variant={validation.isValid ? "secondary" : "destructive"}
              size="sm"
            >
              {validation.isValid ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Valid Layout
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  {validation.overlaps.length + validation.gaps.length} Issues
                </>
              )}
            </Button>
            <Button onClick={onBack} variant="secondary">
              <Home className="mr-2 h-4 w-4" />
              Back to Upload
            </Button>
          </div>
        </div>
      </div>

      {/* 3D Canvas */}
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[12, 10, 12]} />
        <OrbitControls 
          ref={controlsRef}
          enableDamping
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={35}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />

        {/* Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-10, 10, -5]} intensity={0.5} />

        {/* Rooms */}
        {localData.rooms.map((room) => (
          <Room3D
            key={room.id}
            room={room}
            allRooms={localData.rooms}
            isSelected={selectedRoom === room.id}
            onSelect={() => setSelectedRoom(room.id)}
            onDragEnd={(newPosition) => {
              updateRoom(room.id, { position: newPosition });
              setIsDragging(false);
            }}
            isDragging={isDragging && selectedRoom === room.id}
          />
        ))}

        {/* Validation Visualization */}
        {showValidation && validation.overlaps.length > 0 && validation.overlaps.map((overlap, idx) => {
          const r1 = localData.rooms.find(r => r.id === overlap.room1);
          const r2 = localData.rooms.find(r => r.id === overlap.room2);
          if (!r1 || !r2) return null;
          
          return (
            <Line
              key={`overlap-${idx}`}
              points={[r1.position, r2.position]}
              color="red"
              lineWidth={3}
              dashed
            />
          );
        })}

        {showValidation && validation.gaps.length > 0 && validation.gaps.map((gap, idx) => {
          const r1 = localData.rooms.find(r => r.id === gap.room1);
          const r2 = localData.rooms.find(r => r.id === gap.room2);
          if (!r1 || !r2) return null;
          
          return (
            <Line
              key={`gap-${idx}`}
              points={[r1.position, r2.position]}
              color="yellow"
              lineWidth={2}
              dashed
            />
          );
        })}

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <meshStandardMaterial color="#1e293b" opacity={0.5} transparent />
        </mesh>
      </Canvas>

      {/* Controls Info */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-slate-800/90 backdrop-blur-sm px-6 py-4 rounded-xl border border-slate-700 shadow-xl">
          <div className="flex items-center gap-6 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <Move className="h-4 w-4" />
              <span>Select room → Drag to move • Scroll to zoom</span>
            </div>
            <Button
              onClick={handleReset}
              variant="ghost"
              size="sm"
              className="text-slate-300 hover:text-white"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset View
            </Button>
          </div>
        </div>
      </div>

      {/* Selected Room Panel */}
      {selectedRoomData && !editingRoom && (
        <div className="absolute bottom-24 left-6 z-10 bg-slate-800/90 backdrop-blur-sm p-4 rounded-xl border border-slate-700 max-w-sm">
          <h3 className="text-white font-semibold mb-2">{selectedRoomData.name}</h3>
          <div className="space-y-1 text-sm text-slate-300">
            <p><span className="text-slate-400">Dimensions:</span> {selectedRoomData.originalMeasurements?.width} × {selectedRoomData.originalMeasurements?.depth}</p>
            <p><span className="text-slate-400">Position:</span> [{selectedRoomData.position.map(p => p.toFixed(2)).join(', ')}]</p>
            <p><span className="text-slate-400">Area:</span> {(selectedRoomData.dimensions[0] * selectedRoomData.dimensions[2]).toFixed(2)} m²</p>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              onClick={() => rotateRoom(selectedRoom!)}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Rotate
            </Button>
            <Button
              onClick={() => {
                setEditingRoom(selectedRoom);
                setSelectedRoom(null);
              }}
              size="sm"
              className="flex-1"
            >
              Edit
            </Button>
            <Button
              onClick={() => setSelectedRoom(null)}
              variant="secondary"
              size="sm"
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Edit Room Panel */}
      {editingRoomData && (
        <div className="absolute bottom-24 left-6 z-10 bg-slate-800/90 backdrop-blur-sm p-4 rounded-xl border border-slate-700 max-w-md">
          <h3 className="text-white font-semibold mb-3">Edit {editingRoomData.name}</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Position X</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.position[0].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    position: [parseFloat(e.target.value), editingRoomData.position[1], editingRoomData.position[2]]
                  })}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Position Z</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.position[2].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    position: [editingRoomData.position[0], editingRoomData.position[1], parseFloat(e.target.value)]
                  })}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Height</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.dimensions[1].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    dimensions: [editingRoomData.dimensions[0], parseFloat(e.target.value), editingRoomData.dimensions[2]]
                  })}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Width (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.dimensions[0].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    dimensions: [parseFloat(e.target.value), editingRoomData.dimensions[1], editingRoomData.dimensions[2]]
                  })}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Depth (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.dimensions[2].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    dimensions: [editingRoomData.dimensions[0], editingRoomData.dimensions[1], parseFloat(e.target.value)]
                  })}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Color</label>
              <input
                type="color"
                value={editingRoomData.color}
                onChange={(e) => updateRoom(editingRoom!, { color: e.target.value })}
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
          </div>
          <Button
            onClick={() => setEditingRoom(null)}
            className="mt-3 w-full"
          >
            Done Editing
          </Button>
        </div>
      )}
    </div>
  );
};
