import { PersistentState } from "./persistentStore";

export class TransactionalHistory {
  private past: PersistentState[] = [];
  private present: PersistentState;
  private future: PersistentState[] = [];
  private maxHistory: number;

  constructor(initialState: PersistentState, maxHistory: number = 100) {
    this.present = JSON.parse(JSON.stringify(initialState));
    this.maxHistory = maxHistory;
  }

  public getSnapshot(): PersistentState {
    return JSON.parse(JSON.stringify(this.present));
  }

  public push(newState: PersistentState): void {
    this.past.push(this.present);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.present = JSON.parse(JSON.stringify(newState));
    this.future = [];
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  public undo(): PersistentState | null {
    if (!this.canUndo()) return null;
    const previous = this.past.pop()!;
    this.future.unshift(this.present);
    this.present = previous;
    return this.getSnapshot();
  }

  public redo(): PersistentState | null {
    if (!this.canRedo()) return null;
    const next = this.future.shift()!;
    this.past.push(this.present);
    this.present = next;
    return this.getSnapshot();
  }
}
