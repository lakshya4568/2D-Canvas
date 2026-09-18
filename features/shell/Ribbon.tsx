"use client";

/**
 * The ribbon. Each tab shows its own panel set (Home, Draw, Modify, Annotate,
 * Parametric, Bridge, Output) — the commands a bridge draftsman reaches for,
 * grouped the way AutoCAD groups them so nothing has to be relearnt.
 */

import React from "react";
import {
  MousePointer2,
  Hand,
  Slash,
  Spline,
  Square,
  Circle,
  Hexagon,
  Crosshair,
  Move,
  Copy,
  RotateCw,
  FlipHorizontal2,
  Scaling,
  Grid3x3,
  ArrowRightLeft,
  Scissors,
  MoveHorizontal,
  SplitSquareHorizontal,
  CornerDownRight,
  Link2,
  Unlink,
  Trash2,
  Type,
  MessageSquareText,
  Ruler,
  RulerDimensionLine,
  Radius,
  TriangleRight,
  ChevronsDown,
  PaintBucket,
  Compass,
  Waves,
  Milestone,
  SquareSplitVertical,
  Cloud,
  Boxes,
  Ungroup,
  LayoutTemplate,
  Landmark,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FileCode,
  Image as ImageIcon,
  FolderUp,
  FilePlus2,
  Layers as LayersIcon,
  ScanEye,
  Pentagon,
  Egg,
} from "lucide-react";
import type { ToolId } from "@/lib/geometry/types";
import { useDrawing } from "@/lib/state/drawingContext";
import { useCad } from "@/features/bridge/useCad";
import { LayerControl } from "./LayerControl";

export type RibbonTab = "home" | "draw" | "modify" | "annotate" | "parametric" | "bridge" | "output";

export const RIBBON_TABS: { id: RibbonTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "draw", label: "Draw" },
  { id: "modify", label: "Modify" },
  { id: "annotate", label: "Annotate" },
  { id: "parametric", label: "Parametric" },
  { id: "bridge", label: "Bridge" },
  { id: "output", label: "Output" },
];

function Btn({
  icon: Icon,
  label,
  title,
  onClick,
  active,
  disabled,
  wide,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex flex-col items-center justify-center ${wide ? "w-[58px]" : "w-[46px]"} h-[38px] rounded transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--pen) ${
        active ? "bg-(--pen-soft) text-(--pen) font-semibold" : "text-(--fg-secondary) hover:bg-(--ink-raised) hover:text-(--fg-primary)"
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={1.8} />
      <span className="text-[9.5px] leading-tight mt-0.5 whitespace-nowrap">{label}</span>
    </button>
  );
}

function Group({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-between h-[58px] shrink-0 ${last ? "" : "pr-2.5 border-r border-(--rule)"}`}>
      <div className="flex items-center gap-0.5">{children}</div>
      <span className="text-[9px] text-(--fg-muted) font-semibold tracking-wider uppercase">{label}</span>
    </div>
  );
}

export interface RibbonProps {
  tab: RibbonTab;
  onOpenCatalog: () => void;
  onOpenSheets: () => void;
  onOpenTemplates: () => void;
  onImportDxf?: () => void;
  onOpenDock: (tab: "layers" | "bridge") => void;
  groupRigid: () => void;
  releaseRigid: () => void;
  canGroupRigid: boolean;
  canReleaseRigid: boolean;
}

export function Ribbon(p: RibbonProps) {
  const { state, setTool, dispatch } = useDrawing();
  const cad = useCad();
  const t = (id: ToolId) => () => setTool(id);
  const on = (id: ToolId) => state.tool === id;
  const hasSel = state.selectedIds.length > 0;

  const select = (
    <Group label="Select">
      <Btn icon={MousePointer2} label="Select" title="Select (Esc)" onClick={t("select")} active={on("select")} />
      <Btn icon={Hand} label="Pan" title="Pan (H or hold Space)" onClick={t("pan")} active={on("pan")} />
    </Group>
  );
  const draw = (all: boolean) => (
    <Group label="Draw">
      <Btn icon={Slash} label="Line" title="LINE (L)" onClick={t("line")} active={on("line")} />
      <Btn icon={Spline} label="Polyline" title="PLINE (PL)" onClick={t("polyline")} active={on("polyline")} />
      <Btn icon={Square} label="Rect" title="RECTANG (REC)" onClick={t("rectangle")} active={on("rectangle")} />
      <Btn icon={Circle} label="Circle" title="CIRCLE (C)" onClick={t("circle")} active={on("circle")} />
      {all && <Btn icon={Egg} label="Ellipse" title="ELLIPSE (EL)" onClick={t("ellipse")} active={on("ellipse")} />}
      {all && <Btn icon={Pentagon} label="Polygon" title="POLYGON (POL)" onClick={t("polygon")} active={on("polygon")} />}
      <Btn icon={Crosshair} label="Axis" title="Construction line / centre line (XLINE)" onClick={t("construction")} active={on("construction")} />
    </Group>
  );
  const modify = (all: boolean) => (
    <Group label="Modify">
      <Btn icon={Move} label="Move" title="MOVE (M)" onClick={t("move")} active={on("move")} />
      <Btn icon={Copy} label="Copy" title="COPY (CO) — base point, then destinations" onClick={t("copy")} active={on("copy")} />
      <Btn icon={RotateCw} label="Rotate" title="ROTATE (RO)" onClick={t("rotate")} active={on("rotate")} />
      <Btn icon={FlipHorizontal2} label="Mirror" title="MIRROR (MI)" onClick={t("mirror")} active={on("mirror")} />
      <Btn icon={ArrowRightLeft} label="Offset" title="OFFSET (O) — wall and slab thicknesses" onClick={t("offset")} active={on("offset")} />
      <Btn icon={Scissors} label="Trim" title="TRIM (TR)" onClick={t("trim")} active={on("trim")} />
      <Btn icon={MoveHorizontal} label="Extend" title="EXTEND (EX)" onClick={t("extend")} active={on("extend")} />
      {all && <Btn icon={Grid3x3} label="Array" title="ARRAY (AR) — rectangular or polar" onClick={t("array")} active={on("array")} />}
      {all && <Btn icon={Scaling} label="Scale" title="SCALE (SC) — refuses structural geometry unless confirmed" onClick={t("scale")} active={on("scale")} />}
      {all && <Btn icon={SplitSquareHorizontal} label="Break" title="BREAK (BR)" onClick={t("break")} active={on("break")} />}
      {all && <Btn icon={CornerDownRight} label="Fillet" title="FILLET (F) — join two lines at their corner" onClick={t("fillet")} active={on("fillet")} />}
      {all && <Btn icon={CornerDownRight} label="Chamfer" title="CHAMFER (CHA)" onClick={t("chamfer")} active={on("chamfer")} />}
      {all && <Btn icon={Link2} label="Join" title="JOIN (J) — selected lines into one polyline" onClick={t("join")} disabled={!hasSel} />}
      {all && <Btn icon={Unlink} label="Explode" title="EXPLODE (X)" onClick={t("explode")} disabled={!hasSel} />}
      <Btn icon={Trash2} label="Erase" title="ERASE (E / Delete)" onClick={() => dispatch({ type: "DELETE_SELECTED" })} disabled={!hasSel} />
    </Group>
  );
  const annotate = (all: boolean) => (
    <>
      <Group label="Text">
        <Btn icon={Type} label="Text" title="TEXT / MTEXT (T) — type \\n for a new line" onClick={t("text")} active={on("text")} />
        <Btn icon={MessageSquareText} label="Leader" title="MLEADER (LE)" onClick={t("leader")} active={on("leader")} />
      </Group>
      <Group label="Dimensions">
        <Btn icon={Ruler} label="Linear" title="DIMLINEAR (DLI)" onClick={t("dimlinear")} active={on("dimlinear")} />
        <Btn icon={RulerDimensionLine} label="Aligned" title="DIMALIGNED (DAL)" onClick={t("dimaligned")} active={on("dimaligned")} />
        {all && <Btn icon={Radius} label="Radius" title="DIMRADIUS (DRA)" onClick={t("dimradius")} active={on("dimradius")} />}
        {all && <Btn icon={TriangleRight} label="Angle" title="DIMANGULAR (DAN)" onClick={t("dimangular")} active={on("dimangular")} />}
      </Group>
      <Group label="Levels & fills">
        <Btn icon={ChevronsDown} label="Level" title="Level marker — reads the RL from the geometry" onClick={t("level")} active={on("level")} />
        <Btn icon={PaintBucket} label="Hatch" title="HATCH (H) — click inside a closed area" onClick={t("hatch")} active={on("hatch")} />
      </Group>
      {all && (
        <Group label="Symbols">
          <Btn icon={Compass} label="North" title="North arrow" onClick={t("north")} active={on("north")} />
          <Btn icon={Waves} label="Flow" title="Direction of flow" onClick={t("flow")} active={on("flow")} />
          <Btn icon={Milestone} label="Km" title="Direction of increasing kilometrage" onClick={t("kilometrage")} active={on("kilometrage")} />
          <Btn icon={SquareSplitVertical} label="Section" title="Section cut marker" onClick={t("section")} active={on("section")} />
          <Btn icon={Cloud} label="Rev cloud" title="REVCLOUD — mark a revised area" onClick={t("revcloud")} active={on("revcloud")} wide />
        </Group>
      )}
      {all && (
        <Group label="Scale">
          <label className="flex flex-col items-center gap-0.5 text-[9.5px] text-(--fg-secondary)">
            <select
              aria-label="Annotation scale"
              value={state.cad.settings.annotationScale}
              onChange={(e) => dispatch({ type: "CAD_SET_SETTINGS", patch: { annotationScale: Number(e.target.value) } })}
              className="h-[24px] rounded-[5px] bg-(--ink-app) border border-(--rule) text-[11px] px-1 text-(--fg-primary) font-mono"
            >
              {[20, 25, 50, 75, 100, 150, 200, 250, 500].map((s) => (
                <option key={s} value={s}>
                  1:{s}
                </option>
              ))}
            </select>
            Annotation
          </label>
        </Group>
      )}
    </>
  );
  const layers = (
    <Group label="Layers">
      <LayerControl />
      <Btn icon={LayersIcon} label="Manager" title="Layer properties manager" onClick={() => p.onOpenDock("layers")} />
    </Group>
  );

  let content: React.ReactNode;
  switch (p.tab) {
    case "home":
      content = (
        <>
          {select}
          {draw(false)}
          {modify(false)}
          <Group label="Annotate">
            <Btn icon={Type} label="Text" title="TEXT" onClick={t("text")} active={on("text")} />
            <Btn icon={Ruler} label="Dim" title="DIMLINEAR" onClick={t("dimlinear")} active={on("dimlinear")} />
            <Btn icon={ChevronsDown} label="Level" title="Level marker" onClick={t("level")} active={on("level")} />
            <Btn icon={PaintBucket} label="Hatch" title="HATCH" onClick={t("hatch")} active={on("hatch")} />
          </Group>
          {layers}
          <Group label="Insert" last>
            <Btn icon={Landmark} label="Component" title="Insert a parametric bridge or culvert component" onClick={p.onOpenCatalog} wide />
          </Group>
        </>
      );
      break;
    case "draw":
      content = (
        <>
          {select}
          {draw(true)}
          {layers}
        </>
      );
      break;
    case "modify":
      content = (
        <>
          {select}
          {modify(true)}
          <Group label="Group" last>
            <Btn icon={Boxes} label="Group" title="GROUP (G)" onClick={() => dispatch({ type: "GROUP_SELECTED" })} disabled={state.selectedIds.length < 2} />
            <Btn icon={Ungroup} label="Ungroup" title="UNGROUP" onClick={() => dispatch({ type: "UNGROUP_SELECTED" })} disabled={!hasSel} />
          </Group>
        </>
      );
      break;
    case "annotate":
      content = (
        <>
          {select}
          {annotate(true)}
          {layers}
        </>
      );
      break;
    case "parametric":
      content = (
        <>
          {select}
          <Group label="Constraints">
            <Btn icon={Ruler} label="Dimension" title="Driving dimension on a sketch (DIM)" onClick={t("dimension")} active={on("dimension")} wide />
            <Btn icon={Crosshair} label="Measure" title="Measure distance (DI)" onClick={t("measure")} active={on("measure")} />
          </Group>
          <Group label="Rigid units">
            <Btn icon={Boxes} label="Rigid" title="Group the selection into one rigid piece" onClick={p.groupRigid} disabled={!p.canGroupRigid} />
            <Btn icon={Ungroup} label="Release" title="Release rigid units" onClick={p.releaseRigid} disabled={!p.canReleaseRigid} />
          </Group>
          <Group label="Templates" last>
            <Btn icon={LayoutTemplate} label="Sketch" title="Sketch template catalogue" onClick={p.onOpenTemplates} wide />
            <Btn icon={Landmark} label="Component" title="Parametric component library" onClick={p.onOpenCatalog} wide />
          </Group>
        </>
      );
      break;
    case "bridge":
      content = (
        <>
          {select}
          <Group label="Components">
            <Btn icon={Landmark} label="Library" title="Insert a bridge, culvert, pier, abutment, pile group, well…" onClick={p.onOpenCatalog} wide />
          </Group>
          <Group label="Project">
            <Btn icon={ClipboardList} label="Design basis" title="Project identity, levels and design data with their sources" onClick={() => p.onOpenDock("bridge")} wide />
            <Btn
              icon={ArrowRightLeft}
              label="Apply levels"
              title="Push design-basis levels (rail, formation, HFL, bed, foundation) into the drawing"
              onClick={() => cad.applyDbrLevels()}
              wide
            />
          </Group>
          <Group label="Checks" last>
            <Btn icon={ClipboardCheck} label={`Audit ${cad.audit.counts.blocker + cad.audit.counts.error || ""}`.trim()} title="Run the GAD audit (IRBM, IRCM Table 4.03 checklist, drawing standard)" onClick={() => p.onOpenDock("bridge")} wide />
          </Group>
        </>
      );
      break;
    case "output":
      content = (
        <>
          <Group label="Sheets">
            <Btn icon={FilePlus2} label="New sheet" title="Lay out a GAD sheet with title block at a standard scale" onClick={() => { cad.newSheet(); p.onOpenSheets(); }} wide />
            <Btn icon={ScanEye} label="Preview" title="Sheet preview and plot" onClick={p.onOpenSheets} wide />
          </Group>
          <Group label="Export">
            <Btn icon={FileText} label="PDF" title="Plot all sheets to a vector PDF" onClick={cad.exportPdf} />
            <Btn icon={FileCode} label="DXF" title="Model space to DXF (R12) with layers" onClick={cad.exportDxf} />
            <Btn icon={ImageIcon} label="SVG" title="Model space to SVG with layers" onClick={cad.exportSvg} />
          </Group>
          <Group label="Import" last>
            <Btn icon={FolderUp} label="DXF in" title="Import a DXF drawing" onClick={() => p.onImportDxf?.()} />
          </Group>
        </>
      );
      break;
  }

  return <div className="h-[66px] px-3 flex items-center gap-2.5 bg-(--ink-panel) overflow-x-auto overflow-y-hidden text-[11px]">{content}</div>;
}
