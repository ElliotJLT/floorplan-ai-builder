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
            "#E8E4D9" // Warm off-white
          }
          side={THREE.DoubleSide}
          transparent
          opacity={isDragging ? 0.6 : 0.9}
          roughness={0.7}
          metalness={0.1}
          emissive="#2A2520"
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Walls with warm tones */}
      <mesh position={[0, height / 2, -depth / 2]}>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial color="#E8E4D9" opacity={0.85} transparent roughness={0.7} metalness={0.05} />
      </mesh>
      
      <mesh position={[0, height / 2, depth / 2]}>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial color="#E8E4D9" opacity={0.85} transparent roughness={0.7} metalness={0.05} />
      </mesh>
      
      <mesh position={[-width / 2, height / 2, 0]}>
        <boxGeometry args={[0.1, height, depth]} />
        <meshStandardMaterial color="#E8E4D9" opacity={0.85} transparent roughness={0.7} metalness={0.05} />
      </mesh>
      
      <mesh position={[width / 2, height / 2, 0]}>
        <boxGeometry args={[0.1, height, depth]} />
        <meshStandardMaterial color="#E8E4D9" opacity={0.85} transparent roughness={0.7} metalness={0.05} />
      </mesh>

      {/* Room label background panel */}
      <mesh position={[0, height + 0.3, 0]}>
        <planeGeometry args={[Math.min(width - 0.2, room.name.length * 0.15 + 0.4), 0.35]} />
        <meshBasicMaterial 
          color="#000000" 
          transparent 
          opacity={0.3}
          depthTest={false}
        />
      </mesh>

      {/* Room label with refined styling */}
      <Text
        position={[0, height + 0.3, 0.01]}
        fontSize={0.19}
        color="rgba(255, 255, 255, 0.95)"
        anchorX="center"
        anchorY="middle"
        maxWidth={width - 0.2}
        letterSpacing={0.02}
        fontWeight={500}
        outlineWidth={0.01}
        outlineColor="rgba(0, 0, 0, 0.4)"
      >
        {room.name}
      </Text>

      {/* Dimensions label - smaller and lighter */}
      <Text
        position={[0, height - 0.2, 0]}
        fontSize={0.17}
        color="rgba(255, 255, 255, 0.7)"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.02}
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
    <div className="relative w-full h-screen" style={{
      background: 'linear-gradient(160deg, #8B7355 0%, #6B5D52 25%, #4A4339 50%, #2D2A27 75%, #1A1816 100%)'
    }}>
      {/* Top Bar with gradient overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 pt-8 pb-16 px-12" style={{
        background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.9) 0%, rgba(15, 23, 42, 0) 100%)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        {/* Subtle gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[60px] pointer-events-none" style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(139, 115, 85, 0.1) 100%)'
        }} />
        
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h2 className="text-[2rem] font-playfair font-normal tracking-wide" style={{ color: '#F5F5DC' }}>
              {floorplanData.address || 'Untitled Property'}
            </h2>
            <p className="text-[0.95rem] font-inter mt-1 font-normal tracking-wider" style={{ 
              color: 'rgba(245, 245, 220, 0.6)',
              letterSpacing: '0.03em'
            }}>
              {floorplanData.rooms.filter(r => r.name.includes('Bedroom')).length} Bed Ground Floor Flat • {floorplanData.totalAreaSqFt} sq ft
            </p>
          </div>
          <div className="flex gap-3">
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
              className="font-inter font-medium tracking-wider rounded-lg transition-all duration-200"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1.5px solid rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(16px)',
                color: '#F5F5DC',
                letterSpacing: '0.025em',
                padding: '0.65rem 1.25rem',
                fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {validation.isValid ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" style={{ opacity: 0.9 }} />
                  Valid Layout
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" style={{ opacity: 0.9 }} />
                  {validation.overlaps.length + validation.gaps.length} Issues
                </>
              )}
            </Button>
            <Button 
              onClick={onBack}
              className="font-inter font-medium tracking-wider rounded-lg transition-all duration-200"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1.5px solid rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(16px)',
                color: '#F5F5DC',
                letterSpacing: '0.025em',
                padding: '0.65rem 1.25rem',
                fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Home className="mr-2 h-4 w-4" style={{ opacity: 0.9 }} />
              Back to Upload
            </Button>
          </div>
        </div>
      </div>

      {/* 3D Canvas */}
      <Canvas 
        shadows
        gl={{ 
          powerPreference: 'high-performance', 
          antialias: true,
          preserveDrawingBuffer: true
        }}
        onCreated={({ gl }) => {
          // Handle WebGL context loss
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('WebGL context lost, attempting to restore...');
          });
          
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.log('WebGL context restored');
          });
          
          // Limit pixel ratio on high-DPI displays to prevent context loss
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }}
      >
        <PerspectiveCamera makeDefault position={[12, 10, 12]} />
        <OrbitControls 
          ref={controlsRef}
          enableDamping
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={35}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />

        {/* Warm architectural lighting */}
        <ambientLight color="#FFE5B4" intensity={0.6} />
        <directionalLight
          color="#FFF8E7"
          position={[10, 10, 5]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight color="#FFB347" position={[-5, 5, -5]} intensity={0.3} />

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

        {/* Ground plane with radial gradient spotlight effect */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <meshStandardMaterial 
            color="#3A3530"
            roughness={0.9}
            metalness={0.1}
            opacity={0.95}
            transparent
          />
        </mesh>
      </Canvas>

      {/* Controls Info - Enhanced instruction bar */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10">
        <div className="px-8 py-4 rounded-lg font-inter text-[0.875rem] font-normal" style={{
          background: 'rgba(26, 24, 22, 0.9)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          color: 'rgba(245, 245, 220, 0.75)'
        }}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Move className="h-4 w-4" style={{ opacity: 0.85 }} />
              <span>Select room → Drag to move • Scroll to zoom</span>
            </div>
            <Button
              onClick={handleReset}
              variant="ghost"
              size="sm"
              className="font-inter font-medium transition-all duration-200"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1.5px solid rgba(255, 255, 255, 0.12)',
                backdropFilter: 'blur(16px)',
                color: 'rgba(245, 245, 220, 0.85)',
                letterSpacing: '0.025em',
                padding: '0.5rem 1rem',
                fontWeight: 500,
                borderRadius: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset View
            </Button>
          </div>
        </div>
      </div>

      {/* Selected Room Panel */}
      {selectedRoomData && !editingRoom && (
        <div className="absolute bottom-24 left-6 z-10 p-6 rounded-lg border max-w-sm font-inter" style={{
          background: 'rgba(20, 25, 35, 0.9)',
          backdropFilter: 'blur(20px)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          color: '#F5F5DC'
        }}>
          <h3 className="font-garamond text-lg font-medium mb-3" style={{ color: '#F5F5DC', letterSpacing: '0.02em' }}>
            {selectedRoomData.name}
          </h3>
          <div className="space-y-1 text-sm" style={{ color: 'rgba(245, 245, 220, 0.7)' }}>
            <p>
              <span style={{ color: 'rgba(245, 245, 220, 0.5)' }}>Dimensions:</span> {selectedRoomData.originalMeasurements?.width} × {selectedRoomData.originalMeasurements?.depth}
            </p>
            <p>
              <span style={{ color: 'rgba(245, 245, 220, 0.5)' }}>Position:</span> [{selectedRoomData.position.map(p => p.toFixed(2)).join(', ')}]
            </p>
            <p>
              <span style={{ color: 'rgba(245, 245, 220, 0.5)' }}>Area:</span> {(selectedRoomData.dimensions[0] * selectedRoomData.dimensions[2]).toFixed(2)} m²
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            <Button
              onClick={() => rotateRoom(selectedRoom!)}
              size="sm"
              className="flex-1 font-inter font-medium text-[0.85rem] transition-all duration-200 rounded-md"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1.5px solid rgba(255, 255, 255, 0.12)',
                backdropFilter: 'blur(16px)',
                color: '#F5F5DC',
                letterSpacing: '0.025em',
                fontWeight: 500,
                padding: '0.5rem 1rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" style={{ opacity: 0.9 }} />
              Rotate
            </Button>
            <Button
              onClick={() => {
                setEditingRoom(selectedRoom);
                setSelectedRoom(null);
              }}
              size="sm"
              className="flex-1 font-inter font-medium text-[0.85rem] transition-all duration-200 rounded-md"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1.5px solid rgba(255, 255, 255, 0.18)',
                backdropFilter: 'blur(16px)',
                color: '#F5F5DC',
                letterSpacing: '0.025em',
                fontWeight: 500,
                padding: '0.5rem 1rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Edit
            </Button>
            <Button
              onClick={() => setSelectedRoom(null)}
              size="sm"
              className="font-inter font-medium text-[0.85rem] transition-all duration-200 rounded-md"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1.5px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(16px)',
                color: 'rgba(245, 245, 220, 0.6)',
                letterSpacing: '0.025em',
                fontWeight: 500,
                padding: '0.5rem 1rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Edit Room Panel */}
      {editingRoomData && (
        <div className="absolute bottom-24 left-6 z-10 p-6 rounded-lg border max-w-md font-inter" style={{
          background: 'rgba(20, 25, 35, 0.9)',
          backdropFilter: 'blur(20px)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          color: '#F5F5DC'
        }}>
          <h3 className="font-garamond text-lg font-medium mb-4" style={{ color: '#F5F5DC', letterSpacing: '0.02em' }}>
            Edit {editingRoomData.name}
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs block mb-1" style={{ color: 'rgba(245, 245, 220, 0.6)' }}>Position X</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.position[0].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    position: [parseFloat(e.target.value), editingRoomData.position[1], editingRoomData.position[2]]
                  })}
                  className="w-full px-2 py-1 rounded text-sm"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#F5F5DC'
                  }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'rgba(245, 245, 220, 0.6)' }}>Position Z</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.position[2].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    position: [editingRoomData.position[0], editingRoomData.position[1], parseFloat(e.target.value)]
                  })}
                  className="w-full px-2 py-1 rounded text-sm"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#F5F5DC'
                  }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'rgba(245, 245, 220, 0.6)' }}>Height</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.dimensions[1].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    dimensions: [editingRoomData.dimensions[0], parseFloat(e.target.value), editingRoomData.dimensions[2]]
                  })}
                  className="w-full px-2 py-1 rounded text-sm"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#F5F5DC'
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs block mb-1" style={{ color: 'rgba(245, 245, 220, 0.6)' }}>Width (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.dimensions[0].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    dimensions: [parseFloat(e.target.value), editingRoomData.dimensions[1], editingRoomData.dimensions[2]]
                  })}
                  className="w-full px-2 py-1 rounded text-sm"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#F5F5DC'
                  }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'rgba(245, 245, 220, 0.6)' }}>Depth (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingRoomData.dimensions[2].toFixed(2)}
                  onChange={(e) => updateRoom(editingRoom!, {
                    dimensions: [editingRoomData.dimensions[0], editingRoomData.dimensions[1], parseFloat(e.target.value)]
                  })}
                  className="w-full px-2 py-1 rounded text-sm"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#F5F5DC'
                  }}
                />
              </div>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'rgba(245, 245, 220, 0.6)' }}>Color</label>
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
            className="mt-4 w-full font-inter font-medium transition-all duration-200 rounded-md"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1.5px solid rgba(255, 255, 255, 0.18)',
              backdropFilter: 'blur(16px)',
              color: '#F5F5DC',
              letterSpacing: '0.025em',
              fontWeight: 500,
              padding: '0.65rem 1.25rem'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Done Editing
          </Button>
        </div>
      )}
    </div>
  );
};
