import { useState } from "react";
import { FloorplanUpload } from "@/components/FloorplanUpload";
import { FloorplanViewer3D } from "@/components/FloorplanViewer3D";
import { FloorplanData, AIFloorplanResponse } from "@/types/floorplan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateConnectedLayout, validateLayout } from "@/utils/floorplanLayout";

type ViewState = "upload" | "analyzing" | "viewing";

const Index = () => {
  const [viewState, setViewState] = useState<ViewState>("upload");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [floorplanData, setFloorplanData] = useState<FloorplanData | null>(null);

  const handleFloorplanUploaded = async (imageData: string) => {
    setUploadedImage(imageData);
    setViewState("analyzing");

    try {
      toast.info("Analyzing floorplan with AI...");

      const { data, error } = await supabase.functions.invoke('analyze-floorplan', {
        body: { imageData }
      });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("No data returned from analysis");
      }

      console.log("AI extraction complete:", data);
      
      // Apply deterministic layout algorithm to AI-extracted data
      const aiResponse = data as AIFloorplanResponse;
      const layoutData = calculateConnectedLayout(aiResponse);
      
      // Validate the layout
      const validation = validateLayout(layoutData);
      if (!validation.isValid) {
        console.warn("Layout validation warnings:", validation);
        toast.warning("Layout generated with minor gaps. You can adjust positions manually.");
      } else {
        toast.success("Layout calculation complete!");
      }
      
      console.log("Final layout:", layoutData);
      setFloorplanData(layoutData);
      setViewState("viewing");

    } catch (error) {
      console.error('Error analyzing floorplan:', error);
      toast.error(error instanceof Error ? error.message : "Failed to analyze floorplan");
      setViewState("upload");
      setUploadedImage(null);
    }
  };

  const handleUpdateFloorplan = (data: FloorplanData) => {
    setFloorplanData(data);
  };

  const handleBack = () => {
    setViewState("upload");
    setUploadedImage(null);
    setFloorplanData(null);
  };

  return (
    <>
      {viewState === "upload" && (
        <FloorplanUpload onFloorplanUploaded={handleFloorplanUploaded} />
      )}
      
      {viewState === "analyzing" && (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto" />
            <h2 className="text-2xl font-semibold">Analyzing Floorplan...</h2>
            <p className="text-muted-foreground max-w-md">
              AI is extracting room dimensions and adjacency relationships, 
              then calculating precise positions using layout algorithm
            </p>
          </div>
        </div>
      )}
      
      {viewState === "viewing" && uploadedImage && floorplanData && (
        <FloorplanViewer3D
          floorplanImage={uploadedImage}
          floorplanData={floorplanData}
          onBack={handleBack}
          onUpdate={handleUpdateFloorplan}
        />
      )}
    </>
  );
};

export default Index;
