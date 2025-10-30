import { useState } from "react";
import { FloorplanUpload } from "@/components/FloorplanUpload";
import { FloorplanReview } from "@/components/FloorplanReview";
import { FloorplanViewer3D } from "@/components/FloorplanViewer3D";
import { FloorplanData, AIFloorplanResponse } from "@/types/floorplan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateConnectedLayout, validateLayout } from "@/utils/floorplanLayout";

type ViewState = "upload" | "analyzing" | "reviewing" | "viewing";

const Index = () => {
  const [viewState, setViewState] = useState<ViewState>("upload");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AIFloorplanResponse | null>(null);
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
      toast.success("Analysis complete! Review the data before generating 3D.");
      
      setAiResponse(data);
      setViewState("reviewing");

    } catch (error) {
      console.error('Error analyzing floorplan:', error);
      toast.error(error instanceof Error ? error.message : "Failed to analyze floorplan");
      setViewState("upload");
      setUploadedImage(null);
    }
  };

  const handleConfirmReview = (data: AIFloorplanResponse) => {
    console.log('User confirmed review, applying layout algorithm');
    
    // Apply layout algorithm
    console.log('Applying layout algorithm with adjacency count:', data.adjacency?.length || 0);
    const layoutData = calculateConnectedLayout(data);
    
    // Validate the layout
    const validation = validateLayout(layoutData);
    
    if (!validation.isValid) {
      console.warn('Layout validation issues:', validation);
      const overlapDetails = validation.overlaps.map(o => `${o.room1} ↔ ${o.room2}`).join(', ');
      const gapDetails = validation.gaps.map(g => `${g.room1} ↔ ${g.room2} (${g.distance.toFixed(2)}m)`).join(', ');
      
      if (validation.overlaps.length > 0) {
        toast.error(`Room overlaps detected: ${overlapDetails}`);
      }
      if (validation.gaps.length > 0) {
        toast.warning(`Gaps between rooms: ${gapDetails}`);
      }
    } else {
      toast.success('3D model generated successfully!');
    }
    
    setFloorplanData(layoutData);
    setViewState("viewing");
  };

  const handleReanalyze = () => {
    setViewState("analyzing");
    if (uploadedImage) {
      handleFloorplanUploaded(uploadedImage);
    }
  };

  const handleUpdateFloorplan = (data: FloorplanData) => {
    setFloorplanData(data);
  };

  const handleBack = () => {
    setViewState("upload");
    setUploadedImage(null);
    setAiResponse(null);
    setFloorplanData(null);
  };

  const handleBackFromReview = () => {
    setViewState("upload");
    setUploadedImage(null);
    setAiResponse(null);
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
              AI is extracting room dimensions and adjacency relationships
            </p>
          </div>
        </div>
      )}

      {viewState === "reviewing" && aiResponse && (
        <FloorplanReview
          aiResponse={aiResponse}
          onConfirm={handleConfirmReview}
          onReanalyze={handleReanalyze}
          onBack={handleBackFromReview}
        />
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
