import { useState } from "react";
import { FloorplanData, Room } from "@/types/floorplan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface FloorplanEditorProps {
  initialData: FloorplanData;
  onConfirm: (data: FloorplanData) => void;
  onBack: () => void;
}

export const FloorplanEditor = ({ initialData, onConfirm, onBack }: FloorplanEditorProps) => {
  const [floorplanData, setFloorplanData] = useState<FloorplanData>(initialData);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const updateRoom = (roomId: string, updates: Partial<Room>) => {
    setFloorplanData(prev => ({
      ...prev,
      rooms: prev.rooms.map(room =>
        room.id === roomId ? { ...room, ...updates } : room
      )
    }));
  };

  const handleConfirm = () => {
    // Validate no overlaps
    const hasOverlaps = checkOverlaps();
    if (hasOverlaps) {
      toast.error("Some rooms overlap. Please fix positions before continuing.");
      return;
    }

    toast.success("Floorplan validated successfully!");
    onConfirm(floorplanData);
  };

  const checkOverlaps = (): boolean => {
    const rooms = floorplanData.rooms;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const r1 = rooms[i];
        const r2 = rooms[j];
        
        const r1MinX = r1.position[0] - r1.dimensions[0] / 2;
        const r1MaxX = r1.position[0] + r1.dimensions[0] / 2;
        const r1MinZ = r1.position[2] - r1.dimensions[2] / 2;
        const r1MaxZ = r1.position[2] + r1.dimensions[2] / 2;
        
        const r2MinX = r2.position[0] - r2.dimensions[0] / 2;
        const r2MaxX = r2.position[0] + r2.dimensions[0] / 2;
        const r2MinZ = r2.position[2] - r2.dimensions[2] / 2;
        const r2MaxZ = r2.position[2] + r2.dimensions[2] / 2;
        
        const overlapX = r1MinX < r2MaxX && r1MaxX > r2MinX;
        const overlapZ = r1MinZ < r2MaxZ && r1MaxZ > r2MinZ;
        
        if (overlapX && overlapZ) {
          return true;
        }
      }
    }
    return false;
  };

  const selectedRoom = floorplanData.rooms.find(r => r.id === selectedRoomId);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <h1 className="text-3xl font-bold">Review & Edit Floorplan</h1>
          </div>
          <Button onClick={handleConfirm} size="lg">
            <CheckCircle className="mr-2 h-4 w-4" />
            Confirm & View 3D
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Room List */}
          <Card>
            <CardHeader>
              <CardTitle>Rooms ({floorplanData.rooms.length})</CardTitle>
              <p className="text-sm text-muted-foreground">
                Total Area: {floorplanData.totalAreaSqM.toFixed(2)} m² ({floorplanData.totalAreaSqFt.toFixed(2)} sq ft)
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {floorplanData.rooms.map(room => {
                const area = room.dimensions[0] * room.dimensions[2];
                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      selectedRoomId === room.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{room.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {room.originalMeasurements?.width} × {room.originalMeasurements?.depth} ({area.toFixed(2)} m²)
                        </p>
                      </div>
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: room.color }}
                      />
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Room Editor */}
          {selectedRoom ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit {selectedRoom.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Room Name</Label>
                  <Input
                    value={selectedRoom.name}
                    onChange={(e) => updateRoom(selectedRoom.id, { name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Width (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={selectedRoom.dimensions[0]}
                      onChange={(e) => {
                        const newWidth = parseFloat(e.target.value);
                        updateRoom(selectedRoom.id, {
                          dimensions: [newWidth, selectedRoom.dimensions[1], selectedRoom.dimensions[2]]
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Depth (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={selectedRoom.dimensions[2]}
                      onChange={(e) => {
                        const newDepth = parseFloat(e.target.value);
                        updateRoom(selectedRoom.id, {
                          dimensions: [selectedRoom.dimensions[0], selectedRoom.dimensions[1], newDepth]
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Ceiling Height (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={selectedRoom.dimensions[1]}
                    onChange={(e) => {
                      const newHeight = parseFloat(e.target.value);
                      updateRoom(selectedRoom.id, {
                        dimensions: [selectedRoom.dimensions[0], newHeight, selectedRoom.dimensions[2]]
                      });
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Position X (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={selectedRoom.position[0]}
                      onChange={(e) => {
                        const newX = parseFloat(e.target.value);
                        updateRoom(selectedRoom.id, {
                          position: [newX, selectedRoom.position[1], selectedRoom.position[2]]
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Position Z (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={selectedRoom.position[2]}
                      onChange={(e) => {
                        const newZ = parseFloat(e.target.value);
                        updateRoom(selectedRoom.id, {
                          position: [selectedRoom.position[0], selectedRoom.position[1], newZ]
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input
                    type="color"
                    value={selectedRoom.color}
                    onChange={(e) => updateRoom(selectedRoom.id, { color: e.target.value })}
                  />
                </div>

                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Area: {(selectedRoom.dimensions[0] * selectedRoom.dimensions[2]).toFixed(2)} m²
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Volume: {(selectedRoom.dimensions[0] * selectedRoom.dimensions[1] * selectedRoom.dimensions[2]).toFixed(2)} m³
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-[600px] text-muted-foreground">
                Select a room to edit its properties
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
