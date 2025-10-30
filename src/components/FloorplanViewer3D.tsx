import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Home, Move, RotateCcw } from "lucide-react";

interface Room {
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}

// Hardcoded floorplan data based on the Whateley Road flat
const FLOORPLAN_DATA: Room[] = [
  {
    name: "Reception/Kitchen",
    position: [0, 0, -2],
    size: [7.16, 2.51, 3.30],
    color: "#f0f4f8"
  },
  {
    name: "Principal Bedroom",
    position: [4, 0, 2],
    size: [4.04, 2.51, 3.05],
    color: "#e8f2f7"
  },
  {
    name: "Bedroom 2",
    position: [-3.5, 0, 1],
    size: [3.00, 2.51, 2.21],
    color: "#e0eef5"
  },
  {
    name: "Entrance Hall",
    position: [1, 0, 0.5],
    size: [2, 2.51, 2],
    color: "#d8ebf3"
  },
  {
    name: "Bathroom",
    position: [4, 0, -0.5],
    size: [1.5, 2.51, 1.5],
    color: "#d0e7f1"
  },
  {
    name: "Store",
    position: [3, 0, -2.5],
    size: [1.2, 2.51, 1.2],
    color: "#c8e3ef"
  }
];

const Room3D = ({ room }: { room: Room }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={room.position}>
      {/* Floor */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <planeGeometry args={[room.size[0], room.size[2]]} />
        <meshStandardMaterial 
          color={hovered ? "#14b8a6" : room.color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Walls */}
      {/* Back wall */}
      <mesh position={[0, room.size[1] / 2, -room.size[2] / 2]}>
        <boxGeometry args={[room.size[0], room.size[1], 0.1]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>
      
      {/* Front wall */}
      <mesh position={[0, room.size[1] / 2, room.size[2] / 2]}>
        <boxGeometry args={[room.size[0], room.size[1], 0.1]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>
      
      {/* Left wall */}
      <mesh position={[-room.size[0] / 2, room.size[1] / 2, 0]}>
        <boxGeometry args={[0.1, room.size[1], room.size[2]]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>
      
      {/* Right wall */}
      <mesh position={[room.size[0] / 2, room.size[1] / 2, 0]}>
        <boxGeometry args={[0.1, room.size[1], room.size[2]]} />
        <meshStandardMaterial color="#e2e8f0" opacity={0.8} transparent />
      </mesh>

      {/* Room label */}
      <Text
        position={[0, 2, 0]}
        fontSize={0.3}
        color="#334155"
        anchorX="center"
        anchorY="middle"
      >
        {room.name}
      </Text>

      {/* Dimensions label */}
      <Text
        position={[0, 1.5, 0]}
        fontSize={0.15}
        color="#64748b"
        anchorX="center"
        anchorY="middle"
      >
        {room.size[0].toFixed(2)}m × {room.size[2].toFixed(2)}m
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
            <h2 className="text-2xl font-bold text-white">Whateley Road, SE22</h2>
            <p className="text-sm text-slate-300">2 Bed Ground Floor Flat • 556 sq ft</p>
          </div>
          <Button onClick={onBack} variant="secondary">
            <Home className="mr-2 h-4 w-4" />
            Back to Upload
          </Button>
        </div>
      </div>

      {/* 3D Canvas */}
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[10, 8, 10]} />
        <OrbitControls 
          ref={controlsRef}
          enableDamping
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={30}
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
        {FLOORPLAN_DATA.map((room, index) => (
          <Room3D key={index} room={room} />
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
          <p>• Reception/Kitchen: 23'6" × 10'10"</p>
          <p>• Principal Bedroom: 13'3" × 10'</p>
          <p>• Bedroom 2: 9'10" × 7'3"</p>
          <p>• Ceiling Height: 2.51m</p>
        </div>
      </div>
    </div>
  );
};
