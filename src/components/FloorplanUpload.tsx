import { useState, useCallback, useRef } from "react";
import { Upload, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import heroBackground from "@/assets/hero-background-autumn.png";

interface FloorplanUploadProps {
  onFloorplanUploaded: (imageData: string) => void;
  isAnalyzing?: boolean;
  previewImage?: string | null;
}

export const FloorplanUpload = ({ onFloorplanUploaded, isAnalyzing = false, previewImage }: FloorplanUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Hero Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroBackground})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col justify-center px-6 md:px-12 lg:px-24 py-16">
        <div className="max-w-3xl">
          {/* Hero Text */}
          <div className="mb-12 space-y-6">
            <h1 className="text-5xl md:text-7xl font-serif font-normal text-white leading-tight">
              Transform floorplans
              <br />
              into reality.
            </h1>
            <p className="text-lg md:text-xl text-white/90 max-w-xl">
              Upload your 2D floorplan and experience it as an immersive 3D walkthrough in seconds.
            </p>
          </div>

          {/* Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            className="space-y-4"
          >
            {isAnalyzing && previewImage ? (
              <div className="space-y-6">
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 max-w-xs">
                  <img 
                    src={previewImage} 
                    alt="Analyzing floorplan" 
                    className="w-full h-auto rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
                  <div>
                    <h3 className="text-xl font-medium text-white">Analyzing floorplan...</h3>
                    <p className="text-sm text-white/70">AI is extracting room dimensions and generating 3D layout</p>
                  </div>
                </div>
              </div>
            ) : preview ? (
              <div className="space-y-4">
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 max-w-xs">
                  <img 
                    src={preview} 
                    alt="Floorplan preview" 
                    className="w-full h-auto rounded-lg"
                  />
                </div>
                <Button 
                  variant="outline" 
                  onClick={triggerFileSelect}
                  className="bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20"
                >
                  <FileImage className="mr-2 h-4 w-4" />
                  Choose Different File
                </Button>
              </div>
            ) : (
              <div className="flex gap-3 max-w-2xl">
                <div
                  onClick={triggerFileSelect}
                  className={`
                    flex-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-6 py-4
                    text-white/70 placeholder:text-white/50 cursor-pointer
                    transition-all duration-300 hover:bg-white/15 hover:border-white/30
                    ${isDragging ? "bg-white/20 border-white/40 scale-[1.01]" : ""}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <FileImage className="h-5 w-5 text-white/70" />
                    <span className="text-sm">
                      {isDragging ? "Drop your floorplan here" : "Select floorplan or drag & drop"}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={triggerFileSelect}
                  className="bg-white text-black hover:bg-white/90 px-8 font-medium"
                  size="lg"
                >
                  Upload
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>
            )}
            
            <p className="text-sm text-white/60">
              Supports PNG, JPG, JPEG formats • AI-powered 3D generation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
