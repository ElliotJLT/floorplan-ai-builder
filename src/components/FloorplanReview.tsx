import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AIFloorplanResponse, AdjacencyRelation, UnifiedRoomData } from "@/types/floorplan";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";

interface FloorplanReviewProps {
  aiResponse: AIFloorplanResponse;
  onConfirm: (data: AIFloorplanResponse) => void;
  onReanalyze: () => void;
  onBack: () => void;
}

export const FloorplanReview = ({ aiResponse, onConfirm, onReanalyze, onBack }: FloorplanReviewProps) => {
  const [rooms, setRooms] = useState<UnifiedRoomData[]>(aiResponse.rooms);
  const [adjacency, setAdjacency] = useState<AdjacencyRelation[]>(aiResponse.adjacency || []);

  const handleRoomChange = (index: number, field: keyof UnifiedRoomData, value: string | number) => {
    const updated = [...rooms];
    if (field === 'width' || field === 'depth') {
      updated[index] = { ...updated[index], [field]: parseFloat(value.toString()) || 0 };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setRooms(updated);
  };

  const getAdjacentRooms = (roomId: string) => {
    return adjacency
      .filter(adj => adj.room1 === roomId || adj.room2 === roomId)
      .map(adj => {
        const otherRoom = adj.room1 === roomId ? adj.room2 : adj.room1;
        const edge = adj.room1 === roomId ? adj.edge : 
          (adj.edge === 'north' ? 'south' : adj.edge === 'south' ? 'north' : 
           adj.edge === 'east' ? 'west' : 'east');
        return { room: otherRoom, edge };
      });
  };

  const handleConfirm = () => {
    const updatedResponse: AIFloorplanResponse = {
      ...aiResponse,
      rooms,
      adjacency,
      totalAreaSqM: rooms.reduce((sum, room) => sum + room.width * room.depth, 0),
    };
    onConfirm(updatedResponse);
  };

  const totalArea = rooms.reduce((sum, room) => sum + room.width * room.depth, 0);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Review Floorplan Data</h1>
              <p className="text-muted-foreground">
                Check and edit the extracted information before generating 3D model
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Rooms Detected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rooms.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Area</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalArea.toFixed(2)} m²</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Connections</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adjacency.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Room Details</CardTitle>
            <CardDescription>
              Edit room dimensions and names. Adjacent rooms are shown as badges.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Room Name</TableHead>
                    <TableHead className="w-[120px]">Width (m)</TableHead>
                    <TableHead className="w-[120px]">Depth (m)</TableHead>
                    <TableHead className="w-[120px]">Area (m²)</TableHead>
                    <TableHead>Adjacent Rooms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room, index) => (
                    <TableRow key={room.id}>
                      <TableCell>
                        <Input
                          value={room.name}
                          onChange={(e) => handleRoomChange(index, 'name', e.target.value)}
                          className="max-w-[200px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          value={room.width}
                          onChange={(e) => handleRoomChange(index, 'width', e.target.value)}
                          className="max-w-[100px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          value={room.depth}
                          onChange={(e) => handleRoomChange(index, 'depth', e.target.value)}
                          className="max-w-[100px]"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {(room.width * room.depth).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getAdjacentRooms(room.id).map((adj, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {adj.room} ({adj.edge})
                            </Badge>
                          ))}
                          {getAdjacentRooms(room.id).length === 0 && (
                            <span className="text-xs text-muted-foreground italic">No connections</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between items-center pt-4">
          <Button variant="outline" onClick={onReanalyze}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Re-analyze Image
          </Button>
          <Button onClick={handleConfirm} size="lg">
            <Check className="h-4 w-4 mr-2" />
            Generate 3D Model
          </Button>
        </div>
      </div>
    </div>
  );
};
