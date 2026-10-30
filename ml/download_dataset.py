"""
Parkinson's Disease MRI Dataset Downloader
Source: https://huggingface.co/datasets/PD-Project/Parkinsons-Disease-MRI-Dataset

Downloads the image dataset into a local data directory outside production application code.
Supports concurrent downloads and resumption.
"""

import os
import sys
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

DATASET_REPO = "PD-Project/Parkinsons-Disease-MRI-Dataset"
API_URL = f"https://huggingface.co/api/datasets/{DATASET_REPO}"
BASE_RESOLVE_URL = f"https://huggingface.co/datasets/{DATASET_REPO}/resolve/main"

DEFAULT_OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "mri_dataset"))

def get_file_list():
    """Fetches list of all files in the Hugging Face repository."""
    print(f"Fetching dataset file listing from {API_URL}...")
    headers = {"User-Agent": "Parkinsons-MRI-Downloader/1.0"}
    resp = requests.get(API_URL, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    
    siblings = [s.get("rfilename") for s in data.get("siblings", [])]
    valid_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    
    image_files = []
    for f in siblings:
        ext = os.path.splitext(f)[1].lower()
        if ext in valid_exts and (f.startswith("PD/") or f.startswith("Normal/")):
            image_files.append(f)
            
    print(f"Found {len(image_files)} image files ({sum(1 for f in image_files if f.startswith('PD/'))} PD, {sum(1 for f in image_files if f.startswith('Normal/'))} Normal).")
    return image_files

def download_file(rfilename, output_dir, session):
    """Downloads a single image file."""
    local_path = os.path.join(output_dir, rfilename.replace("/", os.sep))
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    
    # Check if file exists and has non-zero size
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return True, local_path, 0
        
    url = f"{BASE_RESOLVE_URL}/{rfilename}"
    resp = session.get(url, timeout=30, stream=True)
    if resp.status_code != 200:
        return False, local_path, f"HTTP {resp.status_code}"
        
    bytes_written = 0
    with open(local_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
                bytes_written += len(chunk)
                
    return True, local_path, bytes_written

def download_dataset(output_dir=DEFAULT_OUTPUT_DIR, max_workers=16, limit=None):
    """Downloads the complete dataset with multithreading."""
    print("=" * 60)
    print("Parkinson's Disease MRI Dataset Downloader")
    print(f"Destination: {output_dir}")
    print("=" * 60)
    
    try:
        image_files = get_file_list()
    except Exception as e:
        print(f"\n[ERROR] Failed to fetch dataset file listing: {e}")
        print("\nManual Download Instructions:")
        print("1. Visit https://huggingface.co/datasets/PD-Project/Parkinsons-Disease-MRI-Dataset")
        print("2. Clone with Git LFS:")
        print(f"   git clone https://huggingface.co/datasets/{DATASET_REPO} \"{output_dir}\"")
        print("3. Ensure folders 'PD' and 'Normal' reside inside the destination directory.")
        return False
        
    if limit:
        image_files = image_files[:limit]
        print(f"Downloading limited sample of {limit} images...")
        
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=max_workers, pool_maxsize=max_workers, max_retries=3)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    
    start_time = time.time()
    downloaded_count = 0
    skipped_count = 0
    failed_count = 0
    total_bytes = 0
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_file = {
            executor.submit(download_file, f, output_dir, session): f
            for f in image_files
        }
        
        for idx, future in enumerate(as_completed(future_to_file), 1):
            rfilename = future_to_file[future]
            try:
                success, path, byte_count = future.result()
                if success:
                    if byte_count > 0:
                        downloaded_count += 1
                        total_bytes += byte_count
                    else:
                        skipped_count += 1
                else:
                    failed_count += 1
                    print(f"\n[WARNING] Failed to download {rfilename}: {byte_count}")
            except Exception as exc:
                failed_count += 1
                print(f"\n[ERROR] Exception downloading {rfilename}: {exc}")
                
            if idx % 200 == 0 or idx == len(image_files):
                mb = total_bytes / (1024 * 1024)
                sys.stdout.write(f"\rProgress: {idx}/{len(image_files)} processed ({downloaded_count} new, {skipped_count} cached, {failed_count} errors, {mb:.1f} MB)  ")
                sys.stdout.flush()
                
    elapsed = time.time() - start_time
    print(f"\n\nDownload Summary:")
    print(f" - Total images in target: {downloaded_count + skipped_count}")
    print(f" - Newly downloaded: {downloaded_count} ({total_bytes / (1024*1024):.2f} MB)")
    print(f" - Pre-existing/cached: {skipped_count}")
    print(f" - Failed: {failed_count}")
    print(f" - Time elapsed: {elapsed:.1f}s")
    
    return failed_count == 0

if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUTPUT_DIR
    success = download_dataset(output_dir=out_dir)
    sys.exit(0 if success else 1)
