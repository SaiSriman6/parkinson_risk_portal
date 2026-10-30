import os
import shutil
import tempfile
import time
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from extract_features import extract_voice_features
from predict import predict_parkinsons
from predict_mri import predict_mri_image, is_mri_model_configured, load_mri_model
from predict_gait import analyze_video_gait, is_gait_model_configured, load_gait_model

app = FastAPI(title="Parkinson's Risk Prediction ML Service", version="1.0.0")

# Preload MRI model if available
@app.on_event("startup")
def startup_event():
    if is_mri_model_configured():
        try:
            load_mri_model()
            print("[INFO] MRI model loaded successfully at startup.")
        except Exception as e:
            print(f"[WARNING] Could not preload MRI model: {e}")
    else:
        print("[INFO] MRI model not yet trained or configured on disk.")
    if is_gait_model_configured():
        try:
            load_gait_model()
            print("[INFO] Gait model loaded successfully at startup.")
        except Exception as e:
            print(f"[WARNING] Could not preload Gait model: {e}")
    else:
        print("[INFO] Gait model not yet trained or configured on disk.")

# Enable CORS for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "parkinson-ml-service",
        "mriConfigured": is_mri_model_configured(),
        "gaitConfigured": is_gait_model_configured()
    }

@app.post("/predict")
async def predict_voice(file: UploadFile = File(...)):
    start_time = time.time()
    
    # Check file extensions
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".wav", ".mp3", ".webm", ".ogg"]:
        raise HTTPException(status_code=400, detail="Invalid audio format. Only WAV, MP3, WEBM, and OGG are supported.")
        
    # Save the uploaded file to a temporary file
    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"upload_{int(time.time())}{ext}")
    
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Extract features
        features = extract_voice_features(temp_file_path)
        
        # Run prediction
        result = predict_parkinsons(features)
        
        # Calculate processing time
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        return {
            "features": features,
            "label": result["label"],
            "probability": result["probability"],
            "confidence": result["confidence"],
            "riskLevel": result["riskLevel"],
            "modelVersion": result["modelVersion"],
            "globalFeatureImportances": result.get("globalFeatureImportances", {}),
            "featureDeviations": result.get("featureDeviations", {}),
            "timeMs": processing_time_ms
        }
        
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

        
    finally:
        # Cleanup temporary files
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.post("/extract_features")
async def extract_features_only(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".wav", ".mp3", ".webm", ".ogg"]:
        raise HTTPException(status_code=400, detail="Invalid audio format. Only WAV and MP3 are supported.")
        
    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"extract_{int(time.time())}{ext}")
    
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        features = extract_voice_features(temp_file_path)
        return {"features": features}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feature extraction error: {str(e)}")
        
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.post("/predict_mri")
async def predict_mri_endpoint(file: UploadFile = File(...)):
    """
    Accepts single MRI image upload (PNG, JPG, JPEG, WEBP),
    validates file type, size, dimensions, and readability,
    applies preprocessing and runs MobileNetV2 inference.
    """
    start_time = time.time()

    if not is_mri_model_configured():
        raise HTTPException(
            status_code=503,
            detail="MRI analysis is not configured on this server. Model weights ('mri_model.pt') have not been trained or deployed."
        )

    try:
        file_bytes = await file.read()
        filename = file.filename or "uploaded_image.png"
        result = predict_mri_image(file_bytes, filename)

        processing_time_ms = int((time.time() - start_time) * 1000)
        result["timeMs"] = processing_time_ms
        return result

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except FileNotFoundError as fe:
        raise HTTPException(status_code=503, detail=str(fe))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"MRI inference error: {str(e)}")

@app.post("/predict_gait")
@app.post("/api/video-analysis/predict")
async def predict_gait_endpoint(file: UploadFile = File(...)):
    """
    Accepts walking video upload (MP4, WEBM, MOV, AVI),
    validates file properties, runs OpenCV + MediaPipe Pose
    to extract biomechanical gait features, and runs ML inference
    if a validated model artifact is configured on disk.
    Ensures safe temporary file cleanup.
    """
    start_time = time.time()

    filename = file.filename or "uploaded_video.mp4"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in [".mp4", ".webm", ".mov", ".avi"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid video format '{ext}'. Only MP4, WEBM, MOV, and AVI videos are supported."
        )

    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"upload_gait_{int(time.time() * 1000)}_{os.getpid()}{ext}")

    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = analyze_video_gait(temp_file_path, filename)
        processing_time_ms = int((time.time() - start_time) * 1000)
        result["timeMs"] = processing_time_ms
        return result

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gait analysis processing error: {str(e)}")
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception as clean_err:
                print(f"[WARNING] Could not delete temp video file '{temp_file_path}': {clean_err}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
