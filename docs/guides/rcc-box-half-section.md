# RCC box culvert — half section & half elevation

How to produce the railway GAD view "HALF SECTION & HALF ELEVATION — PROPOSED BRIDGE — (SCALE 1:100)" three ways, and how to add your own relationships afterwards.

The view's level chain follows `docs/bridge-formulas/01-rcc-box-railway.txt`:

| Level | Formula | Id |
| --- | --- | --- |
| Top of bottom slab | bed level − wearing course | RCR-GEO-004 |
| Bottom of box | top of bottom slab − bottom slab | RCR-GEO-005 |
| Soffit (bottom of top slab) | top of bottom slab + clear height | RCR-GEO-007 |
| Top of slab | soffit + top slab | RCR-GEO-006 |
| Earth cushion | max(formation − top of slab, 0) | RCR-LVL-002 |
| Rail level (until you type one) | formation + 0.762 | RCR-LVL-006 |
| Bottom of foundation (R.L.) | bottom of box − PCC − Σ layers | RCR-LVL-004/005 |

With the defaults (bed 96.100, wearing course 150, clear height 4250, slabs 800, formation 105.000, HFL 96.800) the view shows exactly the reference drawing: TOP OF SLAB = 101.000M, BOTTOM OF TOP SLAB = 100.200M, 4000 mm EARTH CUSHION, V.C. 3400, F.B. 8200, R.L. = 94.150M, 11400 overall, 6984 return wall.

---

## 1. The ready-made view (fastest)

1. **Parametric › Component** (or type `INSERT`), choose **RCC box — half section & half elevation**, check the preview, **Insert**. The drawing's annotation scale is set to 1:100.
2. Change values in **Bridge › Parametric components › (the component)** or in **Run** mode. Every level, dimension, hatch and callout regenerates from them.
   - Values marked **auto** (rail level, return wall length) follow their formula until you type a number. The ↺ button hands them back.
   - **Foundation layers under the PCC** is a list: **Add row** gives "150THK. NEW LAYER"; set its thickness and hatch, reorder or delete rows.
3. An edit that would break the section (haunches meeting, a negative thickness) is refused with the reason, and nothing changes.

## 2. Draw it yourself, then make it parametric

1. Draw at true levels: canvas Y is the reduced level (RL × 1000 mm), and the centre line at x = 0 helps symmetry.
2. Draw the level lines and say what they are. Select a line and use the **What is this?** chip (Bed level, HFL, Formation level, Rail level). Then place level callouts with **LEVEL**. End the label with `=` (for example `BED LEVEL =`) to get the GAD form `BED LEVEL = 96.100M.` written on the line.
3. Draw the box (rectangle), the opening as one closed polyline with the haunch corners cut, the earth cushion outline, the PCC and foundation layers, the embankment slope and boulder strip, and the return wall, slope and steps.
4. **Dimension everything that should change** (DLI): the clear span between the inner faces, each wall, each slab, the clear height, the cushion.
5. Write callouts with their numbers, and point each one into what it describes. `HAUNCH 600 X 600mm` goes on a haunch edge; `150TH. WEARING COURSE` points into that layer.
6. Hatch the materials (**HATCH**: sand, earth, boulder, pitching, PCC, gravel, granular).
7. **Parametric › Parametrize** (or `PARAMETRIZE` / `MP`). The dialog shows the plan:
   - site levels (bed, HFL, formation, rail) are **inputs**;
   - each dimension **drives** a line; a width that is symmetric about ℄ is kept half each side; mirror-image walls share one value;
   - a dimension that closes a loop is a **result** (earth cushion = formation − top of slab; V.C.; F.B.; overall width);
   - callouts that state a thickness become values (Haunch, WearingCourse, GranularFilling…), and a haunch callout drives all four haunches, both legs;
   - notes follow their numbers (`{EarthCushion} mm EARTH CUSHION`).

   Rename anything, switch a dimension between *drives* and *result*, or name a fixed offset to make it a value. Then **Make parametric**. The conversion is refused if any vertex would move.
8. To change the *shape* later, use **Parametric › Edit shape** (`BEDIT`), edit, then **Parametrize** again. Dimension names and your relationships are kept.

## 3. Ask the agent

Examples:

- *"Draw an RCC box culvert half section & half elevation: clear span 10700, walls 350, slabs 800, haunch 600, formation 105.000, bed 96.100, HFL 96.800, 850 granular filling."*
- *"Reconstruct the attached drawing"* (attach the image). The agent reads the level callouts and sizes off it.

The agent loads the `rcc-box-half-section` and `gad-drafting-style` skills, inserts the view with the values it read, and sets the foundation layers with `set_table`. It then checks the worked-out results (cushion, V.C., F.B.) against the drawing. For a non-standard arrangement it draws by hand and uses `make_parametric`. It looks formulas up with `bridge_reference` (your formula docs) and quotes their ids.

## Your own relationships

**Author** mode › **Component relationships**:

- **Make a value follow others**: pick a value (or *New value…*), type an expression, and check the live preview. Then **Link it**. Examples:
  - `RailLevel = FormationLevel + 0.762`
  - `TopSlab = ClearSpan / 12`
  - a new value `CushionRatio = EarthCushion / ClearSpan`, reported under *Worked out for you*.
- **Add an input of your own** (e.g. `SlopeRatio = 1.5`) to use in relationships.
- Units: levels in m, lengths in mm. Functions: `min max abs round floor ceil sqrt hypot if(c,a,b) gt ge lt le`, and `sin cos tan atan` in degrees.
- A relationship that names something unknown, goes round in a circle, or breaks the section is refused with the reason.

Run mode shows the result and the names a related value follows, never the formula. The agent can do the same with `relationship` and `add_input`.
