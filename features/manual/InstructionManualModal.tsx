"use client";

import React, { useState } from "react";
import {
  X,
  BookOpen,
  Compass,
  Terminal,
  Keyboard,
  ShieldCheck,
  Search,
  ChevronRight,
  Layers,
  Sparkles,
} from "lucide-react";
import { COMMAND_ALIASES } from "@/lib/commands/CommandRegistry";

interface InstructionManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ManualTab = "getting_started" | "drafting" | "commands" | "controls" | "standards";

export function InstructionManualModal({ isOpen, onClose }: InstructionManualModalProps) {
  const [activeTab, setActiveTab] = useState<ManualTab>("getting_started");
  const [commandSearch, setCommandSearch] = useState("");

  if (!isOpen) return null;

  const filteredCommands = COMMAND_ALIASES.filter(
    (c) =>
      c.commandName.toLowerCase().includes(commandSearch.toLowerCase()) ||
      c.alias.toLowerCase().includes(commandSearch.toLowerCase()) ||
      c.description.toLowerCase().includes(commandSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-4xl h-[85vh] rounded-2xl bg-(--ink-raised) border border-(--rule) shadow-2xl flex flex-col overflow-hidden text-(--fg-primary)">
        {/* Modal Header */}
        <header className="h-[52px] shrink-0 border-b border-(--rule) px-6 flex items-center justify-between bg-(--ink-panel)">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-(--pen-soft) text-(--pen) flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold tracking-tight">UPCE CAD Instruction Manual</h2>
              <p className="text-[10.5px] text-(--fg-muted)">
                Unified Parametric 2D CAD Engine · Draftsman Reference Guide
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-(--fg-muted) hover:text-(--fg-primary) hover:bg-(--ink-raised) transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Modal Body: Navigation Sidebar + Content Area */}
        <div className="flex-1 min-h-0 flex">
          {/* Tabs Sidebar */}
          <nav className="w-56 shrink-0 border-r border-(--rule) p-3 flex flex-col gap-1 bg-(--ink-sunken)/40">
            <button
              onClick={() => setActiveTab("getting_started")}
              className={`w-full px-3 py-2 rounded-lg text-left text-[12px] font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                activeTab === "getting_started"
                  ? "bg-(--pen-soft) text-(--pen) font-semibold"
                  : "text-(--fg-secondary) hover:bg-(--ink-raised)"
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Getting Started</span>
            </button>

            <button
              onClick={() => setActiveTab("drafting")}
              className={`w-full px-3 py-2 rounded-lg text-left text-[12px] font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                activeTab === "drafting"
                  ? "bg-(--pen-soft) text-(--pen) font-semibold"
                  : "text-(--fg-secondary) hover:bg-(--ink-raised)"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Drafting & Coordinates</span>
            </button>

            <button
              onClick={() => setActiveTab("commands")}
              className={`w-full px-3 py-2 rounded-lg text-left text-[12px] font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                activeTab === "commands"
                  ? "bg-(--pen-soft) text-(--pen) font-semibold"
                  : "text-(--fg-secondary) hover:bg-(--ink-raised)"
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Command Dictionary</span>
            </button>

            <button
              onClick={() => setActiveTab("controls")}
              className={`w-full px-3 py-2 rounded-lg text-left text-[12px] font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                activeTab === "controls"
                  ? "bg-(--pen-soft) text-(--pen) font-semibold"
                  : "text-(--fg-secondary) hover:bg-(--ink-raised)"
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>Controls & F-Keys</span>
            </button>

            <button
              onClick={() => setActiveTab("standards")}
              className={`w-full px-3 py-2 rounded-lg text-left text-[12px] font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                activeTab === "standards"
                  ? "bg-(--pen-soft) text-(--pen) font-semibold"
                  : "text-(--fg-secondary) hover:bg-(--ink-raised)"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Standards & Gates</span>
            </button>
          </nav>

          {/* Main Tab Content */}
          <main className="flex-1 min-w-0 p-6 overflow-y-auto text-[12.5px] leading-relaxed flex flex-col gap-6">
            {activeTab === "getting_started" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-base font-bold text-(--fg-primary)">Getting Started with UPCE CAD</h3>
                  <p className="text-(--fg-secondary) mt-1">
                    The Unified Parametric 2D CAD Engine combines professional AutoCAD drafting mechanics
                    with a variational geometric constraint solver.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-2">
                    <h4 className="font-semibold text-(--fg-primary) flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-(--pen)" />
                      Interface Layout
                    </h4>
                    <ul className="list-disc list-inside text-(--fg-muted) space-y-1 text-[11.5px]">
                      <li><strong className="text-(--fg-secondary)">Command Bar (Top):</strong> Undo/Redo, persona modes, viewport toggles, and vector exports.</li>
                      <li><strong className="text-(--fg-secondary)">Tool Rail (Left):</strong> Select, Move, Line, Polyline, Rect, Circle, Chamfer, Dimensions.</li>
                      <li><strong className="text-(--fg-secondary)">Drawing Canvas (Center):</strong> Infinite precision vector canvas with millimeter coordinates.</li>
                      <li><strong className="text-(--fg-secondary)">Command Terminal (Bottom):</strong> AutoCAD-style command prompt with autocomplete.</li>
                      <li><strong className="text-(--fg-secondary)">Persona Dock (Right):</strong> Draftsman, Author, or Run panels.</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-2">
                    <h4 className="font-semibold text-(--fg-primary) flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Viewport Navigation
                    </h4>
                    <ul className="list-disc list-inside text-(--fg-muted) space-y-1 text-[11.5px]">
                      <li><strong className="text-(--fg-secondary)">Pan:</strong> Hold <kbd className="px-1.5 py-0.5 rounded bg-(--ink-raised) border border-(--rule) text-[10px]">Space</kbd> + drag, or drag with Middle Mouse Button.</li>
                      <li><strong className="text-(--fg-secondary)">Zoom:</strong> Scroll Mouse Wheel to zoom centered on cursor position.</li>
                      <li><strong className="text-(--fg-secondary)">Zoom Extents:</strong> Type <kbd className="px-1.5 py-0.5 rounded bg-(--ink-raised) border border-(--rule) text-[10px]">Z</kbd> in command line to reset view.</li>
                    </ul>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-2">
                  <h4 className="font-semibold text-(--fg-primary) flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    AutoCAD File I/O & Interoperability
                  </h4>
                  <p className="text-(--fg-secondary) text-[12px]">
                    Bidirectional AutoCAD DXF exchange and publishing without loss:
                  </p>
                  <div className="grid grid-cols-3 gap-3 mt-1">
                    <div className="p-2.5 rounded-lg border border-(--rule) bg-(--ink-raised)">
                      <span className="font-semibold text-[11px] block">AutoCAD DXF Import (DXFIN)</span>
                      <span className="text-[10px] text-(--fg-muted)">Import industry-standard DXF files via App menu, ribbon, command line, or canvas drag & drop.</span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-(--rule) bg-(--ink-raised)">
                      <span className="font-semibold text-[11px] block">AutoCAD DXF Export (DXFOUT)</span>
                      <span className="text-[10px] text-(--fg-muted)">Native R2010 AC1024 vector exchange with layer schemes and associative dimensions.</span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-(--rule) bg-(--ink-raised)">
                      <span className="font-semibold text-[11px] block">PDF Drawing Sheet</span>
                      <span className="text-[10px] text-(--fg-muted)">Formal ISO 32000-1 A3 engineering sheet with title block and scale bar.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "drafting" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-base font-bold text-(--fg-primary)">Drafting Precision & Coordinate System</h3>
                  <p className="text-(--fg-secondary) mt-1">
                    UPCE adheres to millimeter model-space coordinates. Enter coordinates exactly as you would in AutoCAD.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-3">
                  <h4 className="font-semibold text-(--fg-primary)">Coordinate Entry Syntaxes</h4>
                  <div className="grid grid-cols-2 gap-3 text-[11.5px]">
                    <div className="p-2.5 rounded-lg border border-(--rule) bg-(--ink-raised)">
                      <span className="font-mono text-(--pen) font-semibold block">X,Y</span>
                      <span className="text-(--fg-muted)">Absolute Cartesian (e.g. <code>100,200</code>)</span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-(--rule) bg-(--ink-raised)">
                      <span className="font-mono text-(--pen) font-semibold block">@dX,dY</span>
                      <span className="text-(--fg-muted)">Relative Cartesian displacement (e.g. <code>@50,-30</code>)</span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-(--rule) bg-(--ink-raised)">
                      <span className="font-mono text-(--pen) font-semibold block">Dist&lt;Angle</span>
                      <span className="text-(--fg-muted)">Polar coordinate from origin (e.g. <code>150&lt;45</code>)</span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-(--rule) bg-(--ink-raised)">
                      <span className="font-mono text-(--pen) font-semibold block">@Dist&lt;Angle</span>
                      <span className="text-(--fg-muted)">Relative polar coordinate from last point (e.g. <code>@100&lt;90</code>)</span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-(--rule) bg-(--ink-raised) col-span-2">
                      <span className="font-mono text-(--pen) font-semibold block">Direct Distance Entry</span>
                      <span className="text-(--fg-muted)">Type a scalar (e.g. <code>250</code>) and press Enter to extend in the direction of the cursor.</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-3">
                  <h4 className="font-semibold text-(--fg-primary)">AutoCAD Directional Selection</h4>
                  <div className="grid grid-cols-2 gap-3 text-[11.5px]">
                    <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10">
                      <span className="font-semibold text-blue-400 block">Window Selection (Left-to-Right)</span>
                      <p className="text-(--fg-muted) mt-1">
                        Drag Left-to-Right (<span className="text-blue-400 font-mono">Blue Solid Box</span>). Only objects
                        <strong> completely enclosed</strong> within the rectangle will be selected.
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                      <span className="font-semibold text-emerald-400 block">Crossing Selection (Right-to-Left)</span>
                      <p className="text-(--fg-muted) mt-1">
                        Drag Right-to-Left (<span className="text-emerald-400 font-mono">Green Dashed Box</span>). Any object
                        <strong> touching or intersecting</strong> the boundary will be selected.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "commands" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-(--fg-primary)">Command Dictionary</h3>
                    <p className="text-(--fg-secondary) text-[11.5px]">
                      Type any alias into the command terminal or press Spacebar/Enter to execute.
                    </p>
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-(--fg-muted)" />
                    <input
                      type="text"
                      placeholder="Search commands..."
                      value={commandSearch}
                      onChange={(e) => setCommandSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-[11.5px] rounded-lg bg-(--ink-panel) border border-(--rule) text-(--fg-primary) outline-none w-48 font-mono"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-(--rule) overflow-hidden">
                  <table className="w-full text-left text-[11.5px]">
                    <thead className="bg-(--ink-panel) border-b border-(--rule) text-(--fg-muted) font-mono uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Alias</th>
                        <th className="px-3 py-2">Command</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--rule)">
                      {filteredCommands.map((cmd) => (
                        <tr key={cmd.alias} className="hover:bg-(--ink-sunken)/40">
                          <td className="px-3 py-1.5 font-mono font-bold text-(--pen)">{cmd.alias}</td>
                          <td className="px-3 py-1.5 font-mono text-(--fg-primary)">{cmd.commandName}</td>
                          <td className="px-3 py-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] uppercase font-semibold bg-(--ink-panel) text-(--fg-muted)">
                              {cmd.category}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-(--fg-secondary)">{cmd.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "controls" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-base font-bold text-(--fg-primary)">Controls & Function Keys</h3>
                  <p className="text-(--fg-secondary) mt-1">
                    Standard AutoCAD drafting function keys and quick keyboard shortcuts.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-2">
                    <h4 className="font-semibold text-(--fg-primary)">AutoCAD Function Keys (F-Keys)</h4>
                    <div className="flex flex-col gap-1.5 text-[11.5px]">
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Help & Instruction Manual</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">F1</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Toggle Command Line History</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">F2</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Toggle Object Snap (OSNAP)</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">F3</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Toggle Grid Display</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">F7</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Toggle Ortho Mode (0°/90°)</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">F8</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Toggle Grid Snap</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">F9</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Toggle Polar Tracking</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">F10</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-(--fg-secondary)">Toggle Dynamic Input HUD</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">F12</kbd>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-2">
                    <h4 className="font-semibold text-(--fg-primary)">General Shortcuts</h4>
                    <div className="flex flex-col gap-1.5 text-[11.5px]">
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Undo Action</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">Ctrl+Z</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Redo Action</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">Ctrl+Shift+Z</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Cancel Command / Deselect</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">Escape</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-(--rule)">
                        <span className="text-(--fg-secondary)">Delete Selected Entities</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">Delete / Backspace</kbd>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-(--fg-secondary)">Focus Command Line</span>
                        <kbd className="px-2 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10.5px]">` or Ctrl+`</kbd>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "standards" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-base font-bold text-(--fg-primary)">UPCE-MASTER-1.0 Kernel Standards & Invariants</h3>
                  <p className="text-(--fg-secondary) mt-1">
                    Fundamental engineering principles enforced to prevent geometry degradation.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-[12px]">
                  <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-2">
                    <span className="font-semibold text-(--ok) flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      Zero Conformal Scaling (§8, §29.4)
                    </span>
                    <p className="text-(--fg-muted)">
                      No proportional similarity scaling is ever applied on solve paths. Wall thicknesses,
                      slab depths, and haunches are strictly preserved during span changes. Updates compute
                      the minimum-norm displacement via SVD/Dogleg.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-2">
                    <span className="font-semibold text-(--ok) flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      Planar Rigid-Body Anchor Rule (§18)
                    </span>
                    <p className="text-(--fg-muted)">
                      Every 2D mechanism fixes 3 degrees of freedom (2 translation + 1 rotation) to eliminate
                      rigid body motion and null-space rotational drift.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-2">
                    <span className="font-semibold text-(--ok) flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      Persona Boundary Isolation (§3)
                    </span>
                    <p className="text-(--fg-muted)">
                      Draftsman Mode exposes zero formulas or synthetic names. Dimensions are edited as nominal
                      scalar values. Formulas are visible strictly in Author Mode.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-(--rule) bg-(--ink-panel) flex flex-col gap-2">
                    <span className="font-semibold text-(--ok) flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      Model-Space Tolerance Discipline (§17)
                    </span>
                    <p className="text-(--fg-muted)">
                      All geometric tolerances (0.01 mm weld, 0.1 mm geometry) are enforced in model-space
                      millimeters, never screen pixels.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Modal Footer */}
        <footer className="h-[46px] shrink-0 border-t border-(--rule) px-6 flex items-center justify-between bg-(--ink-panel)">
          <span className="text-[11px] text-(--fg-muted)">
            Press <kbd className="px-1.5 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10px]">?</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-(--ink-raised) border border-(--rule) font-mono text-[10px]">F1</kbd> anywhere to re-open this guide.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-(--pen) text-white font-medium text-[11.5px] hover:opacity-90 transition-opacity cursor-pointer"
          >
            Close Guide
          </button>
        </footer>
      </div>
    </div>
  );
}
