"use client";

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape, RectangleShape, LineShape, CircleShape } from "@/lib/geometry/types";

export function PropertiesPalette() {
  const { state, selectedShape, selectedShapes, dispatch } = useDrawing();

  const handleUpdateNumber = (field: string, val: number) => {
    if (!selectedShape) return;
    dispatch({
      type: "UPDATE_SHAPE",
      id: selectedShape.id,
      updates: {
        [field]: val,
      },
    });
  };

  const handleUpdateString = (field: string, val: string) => {
    if (!selectedShape) return;
    dispatch({
      type: "UPDATE_SHAPE",
      id: selectedShape.id,
      updates: {
        [field]: val,
      },
    });
  };

  if (!selectedShape && selectedShapes.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-3 text-[11px] select-none font-sans">
        <div className="mb-3 pb-2 border-b border-(--rule) flex items-center justify-between">
          <span className="font-semibold text-(--fg-primary)">No Selection</span>
          <span className="text-[10px] text-(--fg-muted) font-mono">Drawing Model</span>
        </div>

        <section className="mb-4">
          <div className="text-[10px] uppercase font-bold tracking-wider text-(--fg-muted) mb-1.5 px-1 bg-(--ink-app)/40 py-0.5 rounded">
            General
          </div>
          <div className="divide-y divide-(--rule) border border-(--rule) rounded overflow-hidden">
            <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
              <span className="text-(--fg-muted)">Drawing Units</span>
              <span className="font-mono text-(--fg-primary)">Millimeters (mm)</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
              <span className="text-(--fg-muted)">Weld Tolerance</span>
              <span className="font-mono text-(--fg-primary)">0.1 mm</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
              <span className="text-(--fg-muted)">Active Layer</span>
              <span className="font-mono text-(--fg-primary)">Layer 0</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
              <span className="text-(--fg-muted)">Total Entities</span>
              <span className="font-mono text-(--pen) font-semibold">{state.shapes.length}</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
              <span className="text-(--fg-muted)">Zoom Scale</span>
              <span className="font-mono text-(--fg-primary)">{state.viewport.scale * 100 >= 10 ? Math.round(state.viewport.scale * 100) : Number((state.viewport.scale * 100).toPrecision(2))}%</span>
            </div>
          </div>
        </section>

        <p className="text-[10.5px] text-(--fg-muted) italic px-1">
          Select any entity on the canvas to inspect and edit its geometric properties.
        </p>
      </div>
    );
  }

  if (selectedShapes.length > 1) {
    return (
      <div className="flex-1 overflow-y-auto p-3 text-[11px] select-none font-sans">
        <div className="mb-3 pb-2 border-b border-(--rule) flex items-center justify-between">
          <span className="font-semibold text-(--fg-primary)">Multiple Entities</span>
          <span className="text-[10px] text-(--pen) font-mono font-bold">{selectedShapes.length} selected</span>
        </div>
        <div className="p-3 rounded bg-(--ink-app)/40 border border-(--rule) text-[11px] text-(--fg-secondary)">
          You have selected {selectedShapes.length} objects. Use the toolbar or commands (M, RO, E) to transform the selection collectively.
        </div>
      </div>
    );
  }

  const s = selectedShape!;
  const shapeTypeCapitalized = s.type.charAt(0).toUpperCase() + s.type.slice(1);

  return (
    <div className="flex-1 overflow-y-auto p-3 text-[11px] select-none font-sans">
      {/* Header with Shape Classification */}
      <div className="mb-3 pb-2 border-b border-(--rule) flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-(--fg-primary) shrink-0">{shapeTypeCapitalized}</span>
          {s.name && <span className="text-[11px] font-mono text-(--pen) truncate">({s.name})</span>}
        </div>
        <span className="text-[10px] text-(--pen) font-mono bg-(--pen-soft) px-1.5 py-0.5 rounded truncate max-w-[130px]" title={s.id}>{s.id}</span>
      </div>

      {/* General Properties */}
      <section className="mb-3">
        <div className="text-[10px] uppercase font-bold tracking-wider text-(--fg-muted) mb-1 px-1 bg-(--ink-app)/40 py-0.5 rounded">
          General
        </div>
        <div className="divide-y divide-(--rule) border border-(--rule) rounded overflow-hidden">
          <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
            <span className="text-(--fg-muted)">Name</span>
            <input
              value={s.name ?? ""}
              placeholder={s.id}
              onChange={(e) => handleUpdateString("name", e.target.value)}
              className="font-mono text-(--fg-primary) bg-(--ink-sunken) text-right outline-none focus:border-(--pen) px-1.5 py-0.5 rounded border border-(--rule) text-[11px] w-[140px]"
            />
          </div>
          <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
            <span className="text-(--fg-muted)">Color</span>
            <span className="font-mono text-(--fg-primary) flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-slate-500" style={{ backgroundColor: s.strokeColor || "#fff" }} />
              ByLayer
            </span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
            <span className="text-(--fg-muted)">Layer</span>
            <span className="font-mono text-(--fg-primary)">0</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
            <span className="text-(--fg-muted)">Linetype</span>
            <span className="font-mono text-(--fg-primary)">Continuous</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
            <span className="text-(--fg-muted)">Lineweight</span>
            <span className="font-mono text-(--fg-primary)">{s.strokeWidth ?? 2} mm</span>
          </div>
        </div>
      </section>

      {/* Geometry Properties (Interactive Live-Edits) */}
      <section className="mb-3">
        <div className="text-[10px] uppercase font-bold tracking-wider text-(--fg-muted) mb-1 px-1 bg-(--ink-app)/40 py-0.5 rounded">
          Geometry
        </div>
        <div className="divide-y divide-(--rule) border border-(--rule) rounded overflow-hidden">
          {s.type === "rectangle" && (
            <>
              <EditablePropertyRow
                label="Position X"
                value={(s as RectangleShape).x}
                unit="mm"
                onChange={(v) => handleUpdateNumber("x", v)}
              />
              <EditablePropertyRow
                label="Position Y"
                value={(s as RectangleShape).y}
                unit="mm"
                onChange={(v) => handleUpdateNumber("y", v)}
              />
              <EditablePropertyRow
                label="Width"
                value={(s as RectangleShape).width}
                unit="mm"
                onChange={(v) => handleUpdateNumber("width", v)}
              />
              <EditablePropertyRow
                label="Height"
                value={(s as RectangleShape).height}
                unit="mm"
                onChange={(v) => handleUpdateNumber("height", v)}
              />
              <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
                <span className="text-(--fg-muted)">Area</span>
                <span className="font-mono text-(--pen) font-semibold">
                  {((s as RectangleShape).width * (s as RectangleShape).height).toFixed(1)} mm²
                </span>
              </div>
            </>
          )}

          {s.type === "line" && (
            <>
              <EditablePropertyRow
                label="Start X"
                value={(s as LineShape).x1}
                unit="mm"
                onChange={(v) => handleUpdateNumber("x1", v)}
              />
              <EditablePropertyRow
                label="Start Y"
                value={(s as LineShape).y1}
                unit="mm"
                onChange={(v) => handleUpdateNumber("y1", v)}
              />
              <EditablePropertyRow
                label="End X"
                value={(s as LineShape).x2}
                unit="mm"
                onChange={(v) => handleUpdateNumber("x2", v)}
              />
              <EditablePropertyRow
                label="End Y"
                value={(s as LineShape).y2}
                unit="mm"
                onChange={(v) => handleUpdateNumber("y2", v)}
              />
              <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
                <span className="text-(--fg-muted)">Length</span>
                <span className="font-mono text-(--pen) font-semibold">
                  {Math.hypot(
                    (s as LineShape).x2 - (s as LineShape).x1,
                    (s as LineShape).y2 - (s as LineShape).y1
                  ).toFixed(1)} mm
                </span>
              </div>
            </>
          )}

          {s.type === "circle" && (
            <>
              <EditablePropertyRow
                label="Center X"
                value={(s as CircleShape).cx}
                unit="mm"
                onChange={(v) => handleUpdateNumber("cx", v)}
              />
              <EditablePropertyRow
                label="Center Y"
                value={(s as CircleShape).cy}
                unit="mm"
                onChange={(v) => handleUpdateNumber("cy", v)}
              />
              <EditablePropertyRow
                label="Radius"
                value={(s as CircleShape).r}
                unit="mm"
                onChange={(v) => handleUpdateNumber("r", v)}
              />
              <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
                <span className="text-(--fg-muted)">Diameter</span>
                <span className="font-mono text-(--pen) font-semibold">
                  {((s as CircleShape).r * 2).toFixed(1)} mm
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
                <span className="text-(--fg-muted)">Circumference</span>
                <span className="font-mono text-(--pen) font-semibold">
                  {(2 * Math.PI * (s as CircleShape).r).toFixed(1)} mm
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel)">
                <span className="text-(--fg-muted)">Area</span>
                <span className="font-mono text-(--pen) font-semibold">
                  {(Math.PI * Math.pow((s as CircleShape).r, 2)).toFixed(1)} mm²
                </span>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function EditablePropertyRow({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (val: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [tempVal, setTempVal] = React.useState(value.toString());

  React.useEffect(() => {
    setTempVal(value.toFixed(1));
  }, [value]);

  const commit = () => {
    setEditing(false);
    const num = parseFloat(tempVal);
    if (!isNaN(num)) {
      onChange(num);
    } else {
      setTempVal(value.toFixed(1));
    }
  };

  return (
    <div className="flex items-center justify-between px-2.5 py-1 bg-(--ink-panel) hover:bg-(--ink-app)/30 transition-colors">
      <span className="text-(--fg-muted)">{label}</span>
      <div className="flex items-center gap-1 font-mono">
        {editing ? (
          <input
            type="number"
            autoFocus
            value={tempVal}
            onChange={(e) => setTempVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setEditing(false);
                setTempVal(value.toFixed(1));
              }
            }}
            className="w-[70px] h-[20px] px-1 text-right rounded bg-(--ink-raised) border border-(--pen) text-[11px] text-(--fg-primary) outline-none"
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            className="cursor-pointer text-(--fg-primary) hover:text-(--pen) hover:underline"
            title="Click to edit value"
          >
            {value.toFixed(1)}
          </span>
        )}
        <span className="text-[10px] text-(--fg-muted)">{unit}</span>
      </div>
    </div>
  );
}
