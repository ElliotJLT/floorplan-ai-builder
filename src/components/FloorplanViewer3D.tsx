import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Home, Move, RotateCcw } from "lucide-react";
import { whateleyRoadFloorplan } from "@/data/whateley-road-floorplan";
import { Room as RoomType } from "@/types/floorplan";

const Room3D = ({ room }: { room: RoomType }) => {
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
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial 
          color={hovered ? "#14b8a6" : room.color}
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
  onBack: () => void;
}

export const FloorplanViewer3D = ({ floorplanImage, onBack }: FloorplanViewer3DProps) => {
  const [controlsMode, setControlsMode] = useState<"orbit" | "first-person">("orbit");
  const controlsRef = useRef<any>();

  const handleReset = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  return (
    <div className="relative w-full h-screen bg-slate-900">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-slate-900/90 to-transparent">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{whateleyRoadFloorplan.address}</h2>
            <p className="text-sm text-slate-300">
              {whateleyRoadFloorplan.rooms.filter(r => r.name.includes('Bedroom')).length} Bed Ground Floor Flat • {whateleyRoadFloorplan.totalAreaSqFt} sq ft
            </p>
          </div>
          <Button onClick={onBack} variant="secondary">
            <Home className="mr-2 h-4 w-4" />
            Back to Upload
          </Button>
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
        {whateleyRoadFloorplan.rooms.map((room) => (
          <Room3D key={room.id} room={room} />
        ))}

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

      {/* Info Panel */}
      <div className="absolute top-24 left-6 z-10 bg-slate-800/90 backdrop-blur-sm p-4 rounded-xl border border-slate-700 max-w-xs">
        <h3 className="text-white font-semibold mb-2">Room Details</h3>
        <div className="space-y-1 text-sm text-slate-300">
          {whateleyRoadFloorplan.rooms.map((room) => (
            room.originalMeasurements && (
              <p key={room.id}>
                • {room.name}: {room.originalMeasurements.width} × {room.originalMeasurements.depth}
              </p>
            )
          ))}
          <p className="pt-2 border-t border-slate-600 mt-2">
            • Ceiling Height: {whateleyRoadFloorplan.ceilingHeight}m
          </p>
        </div>
      </div>
    </div>
  );
};
