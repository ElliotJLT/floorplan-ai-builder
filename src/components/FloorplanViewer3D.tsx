import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Text, Line } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Home, Move, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Room as RoomType, FloorplanData } from "@/types/floorplan";
import { validateLayout } from "@/utils/floorplanLayout";
import { toast } from "sonner";

const Room3D = ({ room, isSelected, onSelect }: { room: RoomType; isSelected: boolean; onSelect: () => void }) => {
  const [hovered, setHovered] = useState(false);
  const [width, height, depth] = room.dimensions;

  return (
    <group position={room.position}>
      {/* Floor */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={onSelect}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial 
          color={isSelected ? "#3b82f6" : hovered ? "#14b8a6" : room.color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Walls */}
      {/* Back wall */}
      <mesh position={[0, height / 2, -depth / 2]}>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>
      
      {/* Front wall */}
      <mesh position={[0, height / 2, depth / 2]}>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>
      
      {/* Left wall */}
      <mesh position={[-width / 2, height / 2, 0]}>
        <boxGeometry args={[0.1, height, depth]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>
      
      {/* Right wall */}
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
            isSelected={selectedRoom === room.id}
            onSelect={() => setSelectedRoom(room.id)}
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
              <span>Drag to rotate • Scroll to zoom</span>
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
              onClick={() => {
                setEditingRoom(selectedRoom);
                setSelectedRoom(null);
              }}
              size="sm"
              className="flex-1"
            >
              Edit Room
            </Button>
            <Button
              onClick={() => setSelectedRoom(null)}
              variant="secondary"
              size="sm"
              className="flex-1"
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
