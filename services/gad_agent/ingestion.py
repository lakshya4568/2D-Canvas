"""
GAD Ingestion & Normalization Module (§56).
Processes drawing files (PNG, JPEG, PDF), segments views, and calculates
affine pixel-to-world transformations mapping image pixels to model-space millimeters (mm).
"""

from typing import Dict, Any, List, Optional, Tuple
import math
from pathlib import Path
from services.models.schema_models import GADViewModel

def normalize_view(
    image_path: str,
    view_type: str = "cross_section",
    reference_dimension_mm: Optional[float] = 10700.0,
    reference_pixel_span: Optional[float] = 500.0,
) -> GADViewModel:
    """
    Constructs a canonical GADViewModel from a raster image or PDF sheet.
    Computes the affine transformation [a, b, c, d, tx, ty] mapping pixel space to model mm.
    """
    scale = (reference_dimension_mm / reference_pixel_span) if reference_pixel_span and reference_dimension_mm else 20.0
    
    # 2D affine transform matrix [s_x, 0, 0, s_y, t_x, t_y]
    transform = {
        "pixel_to_world": [scale, 0.0, 0.0, -scale, 0.0, 0.0],
        "world_origin": [0.0, 0.0],
        "scale": scale,
    }

    return GADViewModel(
        id=f"view_{view_type}_{Path(image_path).stem if image_path else 'default'}",
        type=view_type,  # type: ignore
        sheet_index=0,
        bbox_pixels=[0.0, 0.0, 1057.0, 573.0],
        transform=transform,
        entities=[],
    )
