#!/usr/bin/env python3
"""
UPCE CAD FastMCP Server launcher shim.
Allows launching directly via `python -m server` or `fastmcp run server.py`.
"""
from src.server import main, mcp

if __name__ == "__main__":
    main()
