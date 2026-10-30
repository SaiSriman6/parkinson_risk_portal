"""
CARE-PD Research Dataset Setup & Inspection Utility
---------------------------------------------------
Official Dataset: CARE-PD (NeurIPS 2025 Datasets and Benchmarks Track)
Project Page:     https://neurips2025.care-pd.ca/
GitHub:           https://github.com/TaatiTeam/CARE-PD
Data Repository:  Borealis (University of Toronto Dataverse) - DOI: 10.5683/SP3/TWIKMK
Hugging Face:     https://huggingface.co/datasets/vida-adl/CARE-PD
License:          Creative Commons Attribution-NonCommercial (CC BY-NC 4.0)

Important Dataset Characteristics:
1. CARE-PD aggregates 9 clinical cohorts across 8 medical centers (360+ participants).
2. Data format: Preprocessed, anonymized 3D SMPL human body meshes (pose, trans, beta).
   Raw RGB camera videos are NOT distributed publicly due to patient health privacy
   and multi-site clinical ethics agreements.
3. Clinical Labels: MDS-UPDRS Part III Item 3.10 Gait severity scores (0 to 4) and
   medication states (ON / OFF levodopa).
4. Subject IDs are provided to ensure strict participant-level data splitting.
"""

import os
import sys
import argparse

DATASET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "care_pd")


def check_dataset_status():
    print("=" * 70)
    print("CARE-PD DATASET STATUS CHECK")
    print("=" * 70)
    print(f"Target Directory: {DATASET_DIR}")

    if not os.path.exists(DATASET_DIR):
        print("\n[INFO] CARE-PD dataset directory not found locally.")
        print("\nTo obtain the official CARE-PD dataset:")
        print("1. Review terms of use at: https://neurips2025.care-pd.ca/terms-of-use")
        print("2. Ensure non-commercial research compliance (CC BY-NC 4.0).")
        print("3. Download via Hugging Face CLI:")
        print("   pip install huggingface_hub")
        print("   huggingface-cli download vida-adl/CARE-PD --repo-type dataset --local-dir ./data/care_pd")
        print("\nAlternatively, download from the Borealis Dataverse repository:")
        print("   https://doi.org/10.5683/SP3/TWIKMK")
        return False

    subdirs = [d for d in os.listdir(DATASET_DIR) if os.path.isdir(os.path.join(DATASET_DIR, d))]
    files = [f for f in os.listdir(DATASET_DIR) if os.path.isfile(os.path.join(DATASET_DIR, f))]

    print(f"\n[FOUND] CARE-PD directory exists with {len(files)} files and {len(subdirs)} subdirectories.")
    print("Available folders:", subdirs[:10])
    return True


if __name__ == "__main__":
    check_dataset_status()
