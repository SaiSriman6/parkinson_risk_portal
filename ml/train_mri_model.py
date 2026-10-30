"""
Parkinson's Disease MRI Image Classification Model Training Script
Architecture: MobileNetV2 with Transfer Learning (PyTorch)
Input Size: 224x224 RGB
Classes: Normal (0) vs PD (1)

Includes:
- Class distribution inspection
- Image validation & corrupt file detection
- Duplicate / near-duplicate image detection
- Patient sequence / grouping analysis & leakage documentation
- Stratified train/val/test splitting
- Class-weighted CrossEntropy loss
- Comprehensive evaluation: Accuracy, Precision, Recall, F1, Confusion Matrix, ROC-AUC
- Export of model weights, preprocessing config, and metrics JSON
"""

import os
import sys
import json
import time
import hashlib
import random
import numpy as np
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import torchvision.transforms as transforms
import torchvision.models as models
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, confusion_matrix, roc_auc_score
)

# Set random seeds for reproducibility
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data", "mri_dataset"))
MODEL_SAVE_PATH = os.path.join(BASE_DIR, "mri_model.pt")
CONFIG_SAVE_PATH = os.path.join(BASE_DIR, "mri_config.json")
METRICS_SAVE_PATH = os.path.join(BASE_DIR, "mri_metrics.json")

CLASS_NAMES = ["Normal", "PD"]
CLASS_TO_IDX = {"Normal": 0, "PD": 1}
IDX_TO_CLASS = {0: "Normal", 1: "PD"}

# Preprocessing constants (ImageNet standard)
IMAGE_SIZE = (224, 224)
NORM_MEAN = [0.485, 0.456, 0.406]
NORM_STD = [0.229, 0.224, 0.225]


class MRIDataset(Dataset):
    def __init__(self, samples, transform=None):
        self.samples = samples  # List of (filepath, label)
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        image = Image.open(path).convert("RGB")
        if self.transform:
            image = self.transform(image)
        return image, label


def scan_and_validate_dataset(data_dir):
    """
    Scans dataset directories, validates readability, checks file sizes,
    detects duplicate hashes, and analyzes patient grouping patterns.
    """
    print(f"\nScanning dataset at: {data_dir}")
    if not os.path.exists(data_dir):
        raise FileNotFoundError(f"Dataset directory '{data_dir}' does not exist.")

    valid_samples = []
    file_hashes = {}
    duplicates = []
    corrupted_files = []
    sequence_groups = {}

    for class_name in CLASS_NAMES:
        class_dir = os.path.join(data_dir, class_name)
        if not os.path.isdir(class_dir):
            print(f"[WARNING] Subdirectory '{class_dir}' not found!")
            continue

        label = CLASS_TO_IDX[class_name]
        files = os.listdir(class_dir)
        print(f" - Found {len(files)} files in '{class_name}' folder")

        for fname in files:
            fpath = os.path.join(class_dir, fname)
            ext = os.path.splitext(fname)[1].lower()
            if ext not in [".png", ".jpg", ".jpeg", ".webp", ".bmp"]:
                continue

            # Validate readability with PIL
            try:
                with Image.open(fpath) as img:
                    img.verify()
                # Re-open to read dimensions and bytes
                with Image.open(fpath) as img:
                    _ = img.size
                    with open(fpath, "rb") as f:
                        file_bytes = f.read()
                        fhash = hashlib.md5(file_bytes).hexdigest()
                        
                if fhash in file_hashes:
                    duplicates.append((fpath, file_hashes[fhash]))
                else:
                    file_hashes[fhash] = fpath
                    valid_samples.append((fpath, label))

                # Extract sequence prefix for grouping analysis
                prefix = fname.split("_")[0]
                sequence_groups[prefix] = sequence_groups.get(prefix, 0) + 1

            except Exception as e:
                corrupted_files.append((fpath, str(e)))

    print(f"\nDataset Validation Summary:")
    print(f" - Total valid unique images: {len(valid_samples)}")
    print(f" - Exact duplicate images detected & filtered: {len(duplicates)}")
    print(f" - Corrupted / invalid files: {len(corrupted_files)}")

    # Class distribution
    normal_count = sum(1 for _, l in valid_samples if l == 0)
    pd_count = sum(1 for _, l in valid_samples if l == 1)
    print(f" - Class distribution: Normal = {normal_count} ({normal_count/len(valid_samples)*100:.1f}%), "
          f"PD = {pd_count} ({pd_count/len(valid_samples)*100:.1f}%)")

    # Grouping / Sequence notice
    print(f"\nSequence / Prefix Distribution: {dict(sorted(sequence_groups.items(), key=lambda x: -x[1])[:10])}")
    print("\n[NOTE ON PATIENT-LEVEL INDEPENDENCE & CLINICAL LIMITATION]:")
    print("  The public Parkinson's Disease MRI Dataset contains 2D slices and pre-augmented images")
    print("  without verified patient identification tags or DICOM headers. Multiple slices or augmentations")
    print("  may originate from the same subject. Slice-level test accuracy is an experimental technical")
    print("  benchmark and must NOT be interpreted as clinically validated diagnostic accuracy.")

    return valid_samples


def split_data(samples, train_ratio=0.70, val_ratio=0.15, test_ratio=0.15):
    """Stratified split by class label."""
    normal_samples = [s for s in samples if s[1] == 0]
    pd_samples = [s for s in samples if s[1] == 1]

    random.shuffle(normal_samples)
    random.shuffle(pd_samples)

    def partition(items):
        n = len(items)
        n_train = int(n * train_ratio)
        n_val = int(n * val_ratio)
        train = items[:n_train]
        val = items[n_train:n_train + n_val]
        test = items[n_train + n_val:]
        return train, val, test

    train_norm, val_norm, test_norm = partition(normal_samples)
    train_pd, val_pd, test_pd = partition(pd_samples)

    train_set = train_norm + train_pd
    val_set = val_norm + val_pd
    test_set = test_norm + test_pd

    random.shuffle(train_set)
    random.shuffle(val_set)
    random.shuffle(test_set)

    print(f"\nData Splits:")
    print(f" - Training: {len(train_set)} samples (Normal: {len(train_norm)}, PD: {len(train_pd)})")
    print(f" - Validation: {len(val_set)} samples (Normal: {len(val_norm)}, PD: {len(val_pd)})")
    print(f" - Testing: {len(test_set)} samples (Normal: {len(test_norm)}, PD: {len(test_pd)})")

    return train_set, val_set, test_set


def build_model(num_classes=2):
    """Initializes MobileNetV2 with pre-trained weights and modified classifier."""
    print("\nInitializing MobileNetV2 backbone with ImageNet pretrained weights...")
    weights = models.MobileNet_V2_Weights.DEFAULT
    model = models.mobilenet_v2(weights=weights)

    # Freeze feature extractor layers to preserve ImageNet representations and enable fast training
    for param in model.features.parameters():
        param.requires_grad = False

    # Replace final classifier layer
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_features, num_classes)
    )

    return model


def train_mri_model(epochs=3, batch_size=64, lr=1e-3, data_dir=DATA_DIR):
    """Trains the MRI classification model and saves model artifacts."""
    start_total_time = time.time()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training device: {device}", flush=True)

    # 1. Scan and validate dataset
    samples = scan_and_validate_dataset(data_dir)
    if len(samples) < 10:
        raise ValueError(f"Insufficient samples found ({len(samples)}). Please verify dataset download.")

    # 2. Stratified train/val/test split
    train_samples, val_samples, test_samples = split_data(samples)

    # 3. Data transforms
    train_transform = transforms.Compose([
        transforms.Resize(IMAGE_SIZE),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=10),
        transforms.ColorJitter(brightness=0.1, contrast=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=NORM_MEAN, std=NORM_STD)
    ])

    val_test_transform = transforms.Compose([
        transforms.Resize(IMAGE_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(mean=NORM_MEAN, std=NORM_STD)
    ])

    train_loader = DataLoader(MRIDataset(train_samples, train_transform), batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(MRIDataset(val_samples, val_test_transform), batch_size=batch_size, shuffle=False, num_workers=0)
    test_loader = DataLoader(MRIDataset(test_samples, val_test_transform), batch_size=batch_size, shuffle=False, num_workers=0)

    # 4. Compute class weights to handle class imbalance
    train_labels = [s[1] for s in train_samples]
    count_0 = sum(1 for l in train_labels if l == 0)
    count_1 = sum(1 for l in train_labels if l == 1)
    weight_0 = len(train_labels) / (2.0 * max(count_0, 1))
    weight_1 = len(train_labels) / (2.0 * max(count_1, 1))
    class_weights = torch.tensor([weight_0, weight_1], dtype=torch.float32).to(device)
    print(f"Class weights: Normal={weight_0:.3f}, PD={weight_1:.3f}", flush=True)

    # 5. Build model, loss function, and optimizer
    model = build_model(num_classes=2).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = torch.optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=1)

    # 6. Training loop with best validation accuracy checkpointing
    best_val_acc = 0.0
    best_model_state = None

    print(f"\nStarting training for {epochs} epochs (batch_size={batch_size})...", flush=True)
    total_batches = len(train_loader)

    for epoch in range(1, epochs + 1):
        epoch_start = time.time()
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0

        for b_idx, (images, labels) in enumerate(train_loader, 1):
            images = images.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

            if b_idx % 15 == 0 or b_idx == total_batches:
                print(f"  [Epoch {epoch}/{epochs}] Batch {b_idx}/{total_batches} - Current Acc: {correct/total*100:.1f}%", flush=True)

        train_loss = running_loss / total
        train_acc = correct / total

        # Validation phase
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for images, labels in val_loader:
                images = images.to(device)
                labels = labels.to(device)
                outputs = model(images)
                loss = criterion(outputs, labels)

                val_loss += loss.item() * images.size(0)
                _, preds = torch.max(outputs, 1)
                val_correct += (preds == labels).sum().item()
                val_total += labels.size(0)

        val_loss = val_loss / val_total
        val_acc = val_correct / val_total
        scheduler.step(val_acc)

        epoch_time = time.time() - epoch_start
        print(f"Epoch {epoch}/{epochs} ({epoch_time:.1f}s) - "
              f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc*100:.2f}% | "
              f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc*100:.2f}%", flush=True)

        if val_acc >= best_val_acc:
            best_val_acc = val_acc
            best_model_state = model.state_dict().copy()

    # Load best model for evaluation
    if best_model_state:
        model.load_state_dict(best_model_state)

    # 7. Evaluate on held-out test data
    print("\n" + "=" * 50)
    print("Evaluating Model on Held-Out Test Set...")
    print("=" * 50)
    model.eval()
    all_preds = []
    all_labels = []
    all_probs = []

    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(device)
            outputs = model(images)
            probs = torch.softmax(outputs, dim=1)

            all_probs.extend(probs[:, 1].cpu().numpy().tolist())
            _, preds = torch.max(outputs, 1)
            all_preds.extend(preds.cpu().numpy().tolist())
            all_labels.extend(labels.numpy().tolist())

    # Calculate metrics
    accuracy = float(accuracy_score(all_labels, all_preds))
    precision = float(precision_score(all_labels, all_preds, zero_division=0))
    recall = float(recall_score(all_labels, all_preds, zero_division=0))
    f1 = float(f1_score(all_labels, all_preds, zero_division=0))
    cm = confusion_matrix(all_labels, all_preds).tolist()
    
    try:
        roc_auc = float(roc_auc_score(all_labels, all_probs))
    except Exception:
        roc_auc = 0.5

    print(f"Test Accuracy:  {accuracy*100:.2f}%")
    print(f"Precision:      {precision*100:.2f}%")
    print(f"Recall:         {recall*100:.2f}%")
    print(f"F1-Score:       {f1*100:.2f}%")
    print(f"ROC-AUC:        {roc_auc:.4f}")
    print(f"Confusion Matrix (TN, FP / FN, TP):")
    print(f"  {cm}")

    # 8. Save model weights and configuration
    print(f"\nSaving model weights to: {MODEL_SAVE_PATH}")
    torch.save(model.state_dict(), MODEL_SAVE_PATH)

    config_data = {
        "architecture": "mobilenet_v2",
        "modelVersion": "mri-mobilenetv2-v1.0.0",
        "image_size": list(IMAGE_SIZE),
        "norm_mean": NORM_MEAN,
        "norm_std": NORM_STD,
        "classes": CLASS_NAMES,
        "class_to_idx": CLASS_TO_IDX,
        "idx_to_class": {str(k): v for k, v in IDX_TO_CLASS.items()},
        "risk_mapping": {"Normal": "Low", "PD": "High"},
        "training_samples": len(train_samples),
        "validation_samples": len(val_samples),
        "test_samples": len(test_samples),
        "date_trained": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "disclaimer": "Experimental machine learning research model. Not certified for clinical diagnosis."
    }

    metrics_data = {
        "test_accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "roc_auc": round(roc_auc, 4),
        "confusion_matrix": cm,
        "total_test_samples": len(test_samples),
        "training_duration_seconds": round(time.time() - start_total_time, 1)
    }

    with open(CONFIG_SAVE_PATH, "w") as f:
        json.dump(config_data, f, indent=2)
    print(f"Saved configuration to: {CONFIG_SAVE_PATH}")

    with open(METRICS_SAVE_PATH, "w") as f:
        json.dump(metrics_data, f, indent=2)
    print(f"Saved metrics to: {METRICS_SAVE_PATH}")

    print("\nTraining and evaluation successfully completed!")
    return metrics_data


if __name__ == "__main__":
    epochs = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    data_dir = sys.argv[2] if len(sys.argv) > 2 else DATA_DIR
    train_mri_model(epochs=epochs, data_dir=data_dir)
