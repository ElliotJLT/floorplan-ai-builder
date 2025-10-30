import { useState } from "react";
import { FloorplanUpload } from "@/components/FloorplanUpload";
import { FloorplanViewer3D } from "@/components/FloorplanViewer3D";
import { FloorplanData } from "@/types/floorplan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateConnectedLayout } from "@/utils/floorplanLayout";

type ViewState = "upload" | "analyzing" | "viewing" | "fading";

const Index = () => {
  const [viewState, setViewState] = useState<ViewState>("upload");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [floorplanData, setFloorplanData] = useState<FloorplanData | null>(null);
  const [fadeOut, setFadeOut] = useState(false);

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
      
      // Apply intelligent layout algorithm directly
      const layoutData = calculateConnectedLayout(data);
      
      toast.success("3D model generated! Drag rooms to reposition.");
      
      setFloorplanData(layoutData);
      
      // Fade to black, then show 3D viewer
      setFadeOut(true);
      setTimeout(() => {
        setViewState("viewing");
        setTimeout(() => setFadeOut(false), 50);
      }, 1000);

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
      <div 
        className={`transition-opacity duration-1000 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
      >
        {(viewState === "upload" || viewState === "analyzing") && (
          <FloorplanUpload 
            onFloorplanUploaded={handleFloorplanUploaded}
            isAnalyzing={viewState === "analyzing"}
            previewImage={uploadedImage}
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
      </div>
      
      {/* Black fade overlay */}
      <div 
        className={`fixed inset-0 bg-black pointer-events-none transition-opacity duration-1000 ${
          fadeOut ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ zIndex: 9999 }}
      />
    </>
  );
};

export default Index;
