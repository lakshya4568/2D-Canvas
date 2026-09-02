Side Question: tell me a example to test things, like auto math calulation and fixes happends how to do that what to do ? to test all things, with formula and variables and inherent formula changes itselfs

Here is a simple, step-by-step example you can try right now on the canvas to test all the auto-math, variables, formulas, and structural fixes together:

---

### Step 1: Draw a 3-Sided Triangle (Testing Auto-Naming & Math)
1. Select the **Line Tool** (`L`).
2. Draw three lines connected end-to-end:
   - **Line 1**: Drag horizontally from left to right (e.g., around `200 px`).
   - **Line 2**: Click the right end of Line 1 and drag up vertically (e.g., around `150 px`).
   - **Line 3**: Click the top of Line 2 and snap back to the start of Line 1 to close the triangle.
3. **What to look for**:
   - Each line automatically gets a clean name badge: **`L1: 200`**, **`L2: 150`**, **`L3: 250`**.
   - Look at the right sidebar panel under **Closed Shape Analysis**:
     - **Shoelace Area**: Automatically displays exact area (e.g. `15,000 px²`).
     - **Perimeter**: Displays the sum of all sides (e.g. `600 px`).
     - **Centroid ($\oplus$)**: A cyan crosshair appears inside the triangle marking its center of mass.

---

### Step 2: Test Proportional Auto-Calculation (No Formulas Yet)
1. Switch to the **Select Tool** (`V`) and click on **`L1`** (the bottom line).
2. Look at the bottom formula bar (or the right property panel): it displays `ACTIVE LINE: L1 = 200`.
3. In the formula bar, type:
   ```text
   L1 = 300
   ```
   and press **Enter** (or click `Execute ↵`).
4. **What to look for**:
   - `L1` expands smoothly from `200` to `300`.
   - Because `L2` and `L3` do not have fixed formulas, the engine **autocalculates** their lengths proportionally:
     - `L2` automatically scales from `150` to `225`.
     - `L3` automatically scales from `250` to `375`.
   - The triangle preserves its exact shape and angles, all corners stay **100% closed with $0\text{ px}$ gap**, and the Area and Centroid crosshair update live on screen.

---

### Step 3: Attach an Inherent Formula Relationship
Now link the height directly to the base using a formula:
1. Click on **`L2`** (the vertical line).
2. In the bottom formula bar, type:
   ```text
   L2 = L1 * 0.75
   ```
   and press **Enter**.
3. **What to look for**:
   - `L2` is now mathematically bound to `L1`.
   - Look at the bottom constants bar: `L2` now has a formula tag showing its dependency on `L1`.

---

### Step 4: Test Inherent Formula Updates & Corner Self-Correction
1. Click on **`L1`** again.
2. Change its value to:
   ```text
   L1 = 400
   ```
   and press **Enter**.
3. **What happens automatically**:
   - **Formula evaluation**: `L2` immediately calculates $400 \times 0.75 = \mathbf{300}$.
   - **Corner closure**: Line `L3` automatically adjusts its length and angle to bridge the top of `L2` back to the start of `L1`.
   - **No lines get out**: All 3 vertices remain strictly connected with zero gap.
   - **Live math update**: The Shoelace Area recalculates to $\frac{1}{2} \times 400 \times 300 = \mathbf{60,000\text{ px}^2}$, and the centroid crosshair shifts to the new center.