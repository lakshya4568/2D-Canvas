export type ParameterType = "DRIVING" | "DEPENDENT" | "FIXED";

export interface ParameterEntry {
  id: string;
  name: string;
  type: ParameterType;
  value: number;
  formula?: string;
  unit?: string;
}

export class ParameterManager {
  private parameters = new Map<string, ParameterEntry>();

  public setDriving(name: string, value: number, unit?: string): ParameterEntry {
    const entry: ParameterEntry = {
      id: `param_${name}`,
      name,
      type: "DRIVING",
      value,
      unit,
    };
    this.parameters.set(name, entry);
    return entry;
  }

  public setDependent(
    name: string,
    formula: string,
    initialValue: number = 0,
    unit?: string
  ): ParameterEntry {
    const entry: ParameterEntry = {
      id: `param_${name}`,
      name,
      type: "DEPENDENT",
      value: initialValue,
      formula,
      unit,
    };
    this.parameters.set(name, entry);
    return entry;
  }

  public setFixed(name: string, value: number, unit?: string): ParameterEntry {
    const entry: ParameterEntry = {
      id: `param_${name}`,
      name,
      type: "FIXED",
      value,
      unit,
    };
    this.parameters.set(name, entry);
    return entry;
  }

  public getParameter(name: string): ParameterEntry | undefined {
    return this.parameters.get(name);
  }

  public getValue(name: string): number | undefined {
    return this.parameters.get(name)?.value;
  }

  public updateValue(name: string, value: number): void {
    const param = this.parameters.get(name);
    if (param) {
      param.value = value;
    }
  }

  public getAll(): ParameterEntry[] {
    return Array.from(this.parameters.values());
  }

  public getDrivingParameters(): ParameterEntry[] {
    return this.getAll().filter((p) => p.type === "DRIVING");
  }

  public getDependentParameters(): ParameterEntry[] {
    return this.getAll().filter((p) => p.type === "DEPENDENT");
  }

  public getFixedParameters(): ParameterEntry[] {
    return this.getAll().filter((p) => p.type === "FIXED");
  }
}
