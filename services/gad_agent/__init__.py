"""
Civil General Arrangement Drawing (GAD) Parametric Service (§56).
Pure Python + uv implementation with zero external heavy frameworks.
Provides deterministic geometry extraction, constraint solving, and parametric updates.
"""

from .model import GADService, parse_drawing, update_parameters, query_drawing

__all__ = [
    "GADService",
    "parse_drawing",
    "update_parameters",
    "query_drawing",
]
