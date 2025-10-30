import { useState } from "react";
import { FloorplanUpload } from "@/components/FloorplanUpload";
import { FloorplanViewer3D } from "@/components/FloorplanViewer3D";

const Index = () => {
  const [floorplanData, setFloorplanData] = useState<string | null>(null);

  const handleFloorplanUploaded = (imageData: string) => {
    setFloorplanData(imageData);
  };

  const handleBack = () => {
    setFloorplanData(null);
  };

  return (
    <>
      {!floorplanData ? (
        <FloorplanUpload onFloorplanUploaded={handleFloorplanUploaded} />
      ) : (
        <FloorplanViewer3D floorplanImage={floorplanData} onBack={handleBack} />
      )}
    </>
  );
};

export default Index;
