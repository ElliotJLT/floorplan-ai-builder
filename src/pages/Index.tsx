import { useState } from "react";
import { FloorplanUpload } from "@/components/FloorplanUpload";
import { FloorplanViewer3D } from "@/components/FloorplanViewer3D";
import { FloorplanEditor } from "@/components/FloorplanEditor";
import { FloorplanData } from "@/types/floorplan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ViewState = "upload" | "analyzing" | "editing" | "viewing";

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

      toast.success("Analysis complete! Review the results.");
      setFloorplanData(data);
      setViewState("editing");

    } catch (error) {
      console.error('Error analyzing floorplan:', error);
      toast.error(error instanceof Error ? error.message : "Failed to analyze floorplan");
      setViewState("upload");
      setUploadedImage(null);
    }
  };

  const handleConfirmData = (data: FloorplanData) => {
    setFloorplanData(data);
    setViewState("viewing");
  };

  const handleBack = () => {
    if (viewState === "viewing") {
      setViewState("editing");
    } else if (viewState === "editing") {
      setViewState("upload");
      setUploadedImage(null);
      setFloorplanData(null);
    } else {
      setViewState("upload");
      setUploadedImage(null);
      setFloorplanData(null);
    }
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
            <p className="text-muted-foreground">AI is extracting room dimensions and positions</p>
          </div>
        </div>
      )}
      
      {viewState === "editing" && floorplanData && (
        <FloorplanEditor
          initialData={floorplanData}
          onConfirm={handleConfirmData}
          onBack={handleBack}
        />
      )}
      
      {viewState === "viewing" && uploadedImage && floorplanData && (
        <FloorplanViewer3D
          floorplanImage={uploadedImage}
          floorplanData={floorplanData}
          onBack={handleBack}
        />
      )}
    </>
  );
};

export default Index;
