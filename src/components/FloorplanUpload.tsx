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
  const [additionalImages, setAdditionalImages] = useState<(string | null)[]>([null, null, null]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const additionalInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  // Compress oversized images before sending to the backend to avoid timeouts/413s
  const compressImage = useCallback(async (file: File): Promise<string> => {
    const MAX_DIM = 1600; // px
    const QUALITY = 0.85; // JPEG quality

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    // Load image
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Failed to load image"));
      i.src = dataUrl;
    });

    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    if (scale === 1) return dataUrl; // Small enough, return original

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALITY);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    try {
      const compressed = await compressImage(file);
      setPreview(compressed);
      toast.success("Floorplan uploaded! Add more images or click Analyze.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to process image. Please try another file.");
    }
  }, [compressImage]);

  const handleAdditionalFile = useCallback(async (file: File, index: number) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    try {
      const compressed = await compressImage(file);
      setAdditionalImages(prev => {
        const updated = [...prev];
        updated[index] = compressed;
        return updated;
      });
      toast.success(`Image ${index + 2} added!`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to process image.");
    }
  }, [compressImage]);

  const handleSubmit = useCallback(() => {
    if (!preview) {
      toast.error("Please upload a floorplan first");
      return;
    }
    toast.info("Analyzing floorplan with AI...");
    onFloorplanUploaded(preview);
  }, [preview, onFloorplanUploaded]);

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
      <div className="relative z-10 min-h-screen flex flex-col justify-center px-4 sm:px-6 md:px-12 lg:px-24 py-20 md:py-16">
        <div className="max-w-3xl w-full">
          {/* Hero Text */}
          <div className="mb-8 md:mb-12 space-y-4 md:space-y-6">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-serif font-normal text-white leading-tight">
              Transform floorplans
              <br />
              into reality.
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/90 max-w-xl">
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
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 w-full max-w-xs">
                  <img 
                    src={previewImage} 
                    alt="Analyzing floorplan" 
                    className="w-full h-auto rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-white flex-shrink-0" />
                  <div>
                    <h3 className="text-lg md:text-xl font-medium text-white">Analyzing floorplan...</h3>
                    <p className="text-xs md:text-sm text-white/70">AI is extracting room dimensions and generating 3D layout</p>
                  </div>
                </div>
              </div>
            ) : preview ? (
              <div className="space-y-6">
                {/* Back button */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPreview(null);
                    setAdditionalImages([null, null, null]);
                  }}
                  className="text-white hover:bg-white/10 -ml-2"
                >
                  ← Back
                </Button>

                {/* Main floorplan preview */}
                <div className="space-y-4">
                  <h3 className="text-lg md:text-xl font-medium text-white">Main Floorplan</h3>
                  <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3 md:p-4 w-full max-w-xs">
                    <img 
                      src={preview} 
                      alt="Floorplan preview" 
                      className="w-full h-auto rounded-lg"
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={triggerFileSelect}
                    className="bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20 text-sm md:text-base"
                    size="sm"
                  >
                    <FileImage className="mr-2 h-4 w-4" />
                    Choose Different File
                  </Button>
                </div>

                {/* Additional images section */}
                <div className="space-y-4">
                  <h3 className="text-lg md:text-xl font-medium text-white">Additional Images (Optional)</h3>
                  <p className="text-xs md:text-sm text-white/70">Enhance the aesthetic with more property images</p>
                  
                  <div className="grid grid-cols-3 gap-2 md:gap-3 max-w-2xl">
                    {additionalImages.map((img, idx) => (
                      <div key={idx}>
                        <input
                          ref={el => additionalInputRefs.current[idx] = el}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAdditionalFile(file, idx);
                          }}
                          className="hidden"
                        />
                        <div
                          onClick={() => additionalInputRefs.current[idx]?.click()}
                          className="aspect-square bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg flex items-center justify-center cursor-pointer hover:bg-white/15 hover:border-white/30 transition-all overflow-hidden"
                        >
                          {img ? (
                            <img src={img} alt={`Additional ${idx + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <Upload className="h-6 w-6 md:h-8 md:w-8 text-white/50" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Analyze button */}
                <Button
                  onClick={handleSubmit}
                  className="bg-white text-black hover:bg-white/90 px-8 font-medium w-full sm:w-auto"
                  size="lg"
                >
                  Analyze & Generate 3D
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-2xl">
                <div
                  onClick={triggerFileSelect}
                  className={`
                    flex-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 md:px-6 md:py-4
                    text-white/70 placeholder:text-white/50 cursor-pointer
                    transition-all duration-300 hover:bg-white/15 hover:border-white/30
                    ${isDragging ? "bg-white/20 border-white/40 scale-[1.01]" : ""}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <FileImage className="h-4 w-4 md:h-5 md:w-5 text-white/70 flex-shrink-0" />
                    <span className="text-xs md:text-sm">
                      {isDragging ? "Drop your floorplan here" : "Select floorplan or drag & drop"}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={triggerFileSelect}
                  className="bg-white text-black hover:bg-white/90 px-6 md:px-8 font-medium w-full sm:w-auto"
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
            
            {!preview && (
              <p className="text-xs md:text-sm text-white/60">
                Supports PNG, JPG, JPEG formats • AI-powered 3D generation
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
