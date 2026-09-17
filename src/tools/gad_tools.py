"""
FastMCP Tool Handlers for Civil GAD Operations (§56).
Exposes parse_drawing, update_parameters, and query_drawing to MCP clients.
"""

from typing import Dict, Any, Optional
from fastmcp.tools import ToolResult
from services.gad_agent import parse_drawing, update_parameters, query_drawing

def execute_gad_parse_drawing(
    image_path: Optional[str] = None,
    project_name: str = "RCC Proposed Bridge / Culvert",
    parameters_override: Optional[Dict[str, float]] = None,
) -> ToolResult:
    """
    Parses a General Arrangement Drawing into a parametric GADModel.
    """
    try:
        model = parse_drawing(
            image_path=image_path,
            project_name=project_name,
            parameters_override=parameters_override,
        )
        data = model.model_dump()
        return ToolResult(
            content=f"Successfully parsed GAD drawing into model '{model.id}' with {len(model.entities)} entities and {len(model.parameters)} parameters.",
            structuredContent={"gad_model": data},
        )
    except Exception as e:
        return ToolResult(
            content=f"Failed to parse GAD drawing: {str(e)}",
            isError=True,
            structuredContent={"error": str(e)},
        )

def execute_gad_update_parameters(
    deltas: Dict[str, float],
) -> ToolResult:
    """
    Applies parameter deltas to active GADModel with zero conformal scaling.
    """
    try:
        updated = update_parameters(deltas)
        data = updated.model_dump()
        return ToolResult(
            content=f"Updated parameters: {deltas}. Span={updated.parameters['span'].value}mm, Outer Width={updated.parameters['outer_w'].value}mm. Zero conformal scaling preserved.",
            structuredContent={"gad_model": data},
        )
    except Exception as e:
        return ToolResult(
            content=f"Failed to update GAD parameters: {str(e)}",
            isError=True,
            structuredContent={"error": str(e)},
        )

def execute_gad_query_drawing(
    query_str: str = "waterway",
) -> ToolResult:
    """
    Queries active GAD model for hydraulic, geometric, and clearance metrics.
    """
    try:
        res = query_drawing(query_str)
        return ToolResult(
            content=f"GAD Query Result: Clear Span={res['span_mm']}mm, Clear Height={res['height_mm']}mm, Waterway Area={res['waterway_area_m2']}m².",
            structuredContent={"query_result": res},
        )
    except Exception as e:
        return ToolResult(
            content=f"Failed to query GAD drawing: {str(e)}",
            isError=True,
            structuredContent={"error": str(e)},
        )
