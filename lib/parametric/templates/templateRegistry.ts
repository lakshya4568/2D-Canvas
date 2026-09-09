/**
 * Canonical Template Registry (UPCE-MASTER-1.0 §86, §5.6, §43, §44)
 *
 * Central registry for deliverable, reusable parametric CAD template definitions.
 * Stores templates conforming 100% to schemas/template.schema.json.
 */

import { TemplateDefinition } from "../schemaTypes";
import { CANONICAL_TEMPLATES } from "./canonicalTemplates";

export class TemplateRegistry {
  private templates: Map<string, TemplateDefinition> = new Map();

  constructor(loadDefaults: boolean = true) {
    if (loadDefaults) {
      this.loadCanonicalTemplates();
    }
  }

  public loadCanonicalTemplates(): void {
    for (const tmpl of CANONICAL_TEMPLATES) {
      this.templates.set(tmpl.id, tmpl);
    }
  }

  public registerTemplate(template: TemplateDefinition): void {
    this.templates.set(template.id, template);
  }

  public getTemplate(id: string): TemplateDefinition | undefined {
    return this.templates.get(id);
  }

  public hasTemplate(id: string): boolean {
    return this.templates.has(id);
  }

  public getAllTemplates(): TemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  public getTemplatesByCategory(category: TemplateDefinition["category"]): TemplateDefinition[] {
    return Array.from(this.templates.values()).filter((t) => t.category === category);
  }

  public reset(): void {
    this.templates.clear();
    this.loadCanonicalTemplates();
  }
}

export const templateRegistry = new TemplateRegistry();
