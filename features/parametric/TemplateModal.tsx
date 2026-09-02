"use client";

import React, { useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { BUILTIN_TEMPLATES, TemplateDefinition } from "@/lib/parametric/templates";

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TemplateModal: React.FC<TemplateModalProps> = ({ isOpen, onClose }) => {
  const { dispatch } = useDrawing();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDefinition>(BUILTIN_TEMPLATES[0]);
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    BUILTIN_TEMPLATES[0].parameters.forEach((p) => {
      initial[p.name] = p.defaultValue;
    });
    return initial;
  });

  if (!isOpen) return null;

  const handleSelectTemplate = (tmpl: TemplateDefinition) => {
    setSelectedTemplate(tmpl);
    const initial: Record<string, number> = {};
    tmpl.parameters.forEach((p) => {
      initial[p.name] = p.defaultValue;
    });
    setParamValues(initial);
  };

  const handleParamChange = (name: string, value: number) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleInstantiate = () => {
    dispatch({
      type: "INSTANTIATE_TEMPLATE",
      templateId: selectedTemplate.id,
      params: paramValues,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="flex h-[520px] w-[760px] max-w-full flex-col rounded-xl border border-[var(--border-strong)] bg-[var(--surface-base)] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5 bg-[var(--surface-sunken)]">
          <div className="flex items-center gap-2">
            <span className="text-base">📐</span>
            <span className="font-semibold text-sm text-[var(--text-primary)]">Parametric CAD Template Library</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="grid grid-cols-12 flex-1 overflow-hidden">
          {/* Left: Template Catalog */}
          <div className="col-span-5 border-r border-[var(--border-subtle)] p-3 flex flex-col gap-2 overflow-y-auto bg-[var(--surface-sunken)]/50">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
              Select Template
            </div>
            {BUILTIN_TEMPLATES.map((tmpl) => {
              const isSelected = tmpl.id === selectedTemplate.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-all ${
                    isSelected
                      ? "border-[var(--accent-draw)] bg-[var(--surface-base)] shadow-sm"
                      : "border-transparent bg-transparent hover:bg-[var(--surface-base)]/50 text-[var(--text-secondary)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[var(--text-primary)]">{tmpl.name}</span>
                    <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--text-muted)]">
                      {tmpl.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                    {tmpl.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right: Configure Parameters */}
          <div className="col-span-7 p-5 flex flex-col justify-between overflow-y-auto bg-[var(--surface-base)]">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">{selectedTemplate.name}</h3>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{selectedTemplate.description}</p>
              </div>

              {/* Parameter Controls */}
              <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3.5">
                <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Template Parameters</div>
                <div className="space-y-3">
                  {selectedTemplate.parameters.map((p) => {
                    const currentVal = paramValues[p.name] ?? p.defaultValue;
                    return (
                      <div key={p.name} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text-primary)] font-medium">{p.label}</span>
                          <span className="font-mono font-bold text-[var(--accent-draw)]">
                            {currentVal} {p.unit || ""}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={p.min ?? 10}
                          max={p.max ?? 1000}
                          step={p.step ?? 1}
                          value={currentVal}
                          onChange={(e) => handleParamChange(p.name, parseFloat(e.target.value))}
                          className="w-full accent-[var(--accent-draw)] cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Defined Formulas Preview */}
              {selectedTemplate.formulas.length > 0 && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)]/60 p-3 flex flex-col gap-1.5 text-xs font-mono">
                  <div className="text-[11px] font-sans font-medium text-[var(--text-muted)]">Active Relations</div>
                  <div className="space-y-1">
                    {selectedTemplate.formulas.map((f, i) => (
                      <div key={i} className="text-[11px] text-[var(--text-secondary)]">
                        <span className="text-[var(--accent-draw)]">{f.variable}</span> = {f.formula}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInstantiate}
                className="rounded bg-[var(--accent-draw)] px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 shadow-sm"
              >
                Instantiate on Canvas
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
