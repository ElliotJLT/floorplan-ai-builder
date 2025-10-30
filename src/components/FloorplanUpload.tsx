import { useState, useCallback } from "react";
import { Upload, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FloorplanUploadProps {
  onFloorplanUploaded: (imageData: string) => void;
}

export const FloorplanUpload = ({ onFloorplanUploaded }: FloorplanUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreview(result);
      toast.success("Floorplan uploaded! Generating 3D model...");
      setTimeout(() => {
        onFloorplanUploaded(result);
      }, 1500);
    };
    reader.readAsDataURL(file);
  }, [onFloorplanUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-background to-slate-100 p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
            FloorPlan3D
          </h1>
          <p className="text-lg text-muted-foreground">
            Upload your floorplan and watch it transform into an interactive 3D walkthrough
          </p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          className={`
            relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300
            ${isDragging 
              ? "border-accent bg-accent/5 scale-[1.02]" 
              : "border-border bg-card hover:border-accent/50 hover:bg-accent/5"
            }
          `}
        >
          {preview ? (
            <div className="space-y-6">
              <img 
                src={preview} 
                alt="Floorplan preview" 
                className="w-full h-auto rounded-lg shadow-lg"
              />
              <div className="flex gap-4 justify-center">
                <label>
                  <Button variant="outline" className="cursor-pointer">
                    <FileImage className="mr-2 h-4 w-4" />
                    Choose Different File
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="p-6 rounded-full bg-accent/10">
                  <Upload className="w-16 h-16 text-accent" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold">Upload Your Floorplan</h3>
                <p className="text-muted-foreground">
                  Drag and drop your floorplan image here, or click to browse
                </p>
              </div>

              <label>
                <Button size="lg" className="cursor-pointer">
                  <FileImage className="mr-2 h-5 w-5" />
                  Select File
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>

              <p className="text-sm text-muted-foreground">
                Supports PNG, JPG, JPEG formats
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 p-6 bg-card rounded-xl border">
          <h4 className="font-semibold mb-3 text-slate-700">How it works:</h4>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-semibold">1</span>
              <span>Upload your 2D floorplan image</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-semibold">2</span>
              <span>AI analyzes the layout and dimensions</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-semibold">3</span>
              <span>Explore your space in immersive 3D with WASD controls</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
