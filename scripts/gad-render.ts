#!/usr/bin/env bun
/**
 * gad-render — the headless CLI.
 * UPCE-MASTER-1.0 §69:
 *
 *   gad-render --template culvert.json --set ClearSpan=5000 --set CellCount=3 \
 *              --format dxf --dxf-version R2010 --out out.dxf
 *
 * Reuses the SAME solver and exporter code as the client (§69), via
 * `RenderService` + `TemplateRenderHost`. There is no second render path.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { RenderService, RenderFormat } from "../lib/io/renderService";
import { TemplateRenderHost } from "../lib/io/templateRenderHost";
import { TemplateRegistry } from "../lib/parametric/templates/templateRegistry";
import { StandardsProfileRegistry } from "../lib/validation/standardsProfile";
import { TemplateDefinition } from "../lib/parametric/schemaTypes";
import { DxfVersion } from "../lib/io/dxfExporter";
import { SheetSize } from "../lib/io/pdfSheetExporter";

interface CliArgs {
  template?: string;
  list?: boolean;
  set: Record<string, number>;
  format: RenderFormat;
  dxfVersion: DxfVersion;
  sheetSize: SheetSize;
  scale?: number;
  out?: string;
  project?: string;
  title?: string;
  standards: string[];
  help?: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    set: {},
    format: "dxf",
    dxfVersion: "R2010",
    sheetSize: "A3",
    standards: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Option '${a}' requires a value.`);
      return v;
    };

    switch (a) {
      case "--template": args.template = next(); break;
      case "--list": args.list = true; break;
      case "--set": {
        const kv = next();
        const eq = kv.indexOf("=");
        if (eq <= 0) throw new Error(`--set expects NAME=VALUE, got '${kv}'.`);
        const name = kv.slice(0, eq);
        const value = Number(kv.slice(eq + 1));
        if (!Number.isFinite(value)) throw new Error(`--set ${name}: '${kv.slice(eq + 1)}' is not a number.`);
        args.set[name] = value;
        break;
      }
      case "--format": {
        const f = next();
        if (!["dxf", "pdf", "svg", "json"].includes(f)) {
          throw new Error(`Unsupported --format '${f}'. Use dxf, pdf, svg, or json.`);
        }
        args.format = f as RenderFormat;
        break;
      }
      case "--dxf-version": {
        const v = next();
        if (v !== "R2010" && v !== "R12") throw new Error(`--dxf-version must be R2010 or R12.`);
        args.dxfVersion = v;
        break;
      }
      case "--sheet": {
        const v = next();
        if (!["A1", "A2", "A3", "A4"].includes(v)) throw new Error(`--sheet must be A1, A2, A3, or A4.`);
        args.sheetSize = v as SheetSize;
        break;
      }
      case "--scale": args.scale = Number(next()); break;
      case "--out": args.out = next(); break;
      case "--project": args.project = next(); break;
      case "--title": args.title = next(); break;
      case "--standards": args.standards.push(next()); break;
      case "--help":
      case "-h": args.help = true; break;
      default:
        throw new Error(`Unknown option '${a}'. Run with --help.`);
    }
  }

  return args;
}

const USAGE = `gad-render — headless parametric GAD renderer (UPCE-MASTER-1.0 §69)

Usage:
  gad-render --list
  gad-render --template <id|file.json> [--set NAME=VALUE ...] [options]

Options:
  --template <id|path>   Registered template id, or a path to a template JSON file
  --list                 List the template catalogue and exit
  --set NAME=VALUE       Set a DRIVING parameter (repeatable)
  --format <fmt>         dxf | pdf | svg | json            (default: dxf)
  --dxf-version <v>      R2010 | R12                       (default: R2010)
  --sheet <size>         A1 | A2 | A3 | A4                 (default: A3)
  --scale <n>            Drawing scale denominator, e.g. 50 for 1:50
  --out <path>           Output file (default: stdout for text formats)
  --project <name>       Title-block project name
  --title <name>         Title-block drawing title
  --standards <path>     Standards profile JSON to check against (repeatable)
  -h, --help             This message
`;

export function run(argv: string[]): number {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const registry = new TemplateRegistry();
  const standards = new StandardsProfileRegistry();
  for (const path of args.standards) {
    try {
      standards.register(JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      process.stderr.write(
        `Could not load standards profile '${path}': ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
      return 2;
    }
  }

  const host = new TemplateRenderHost({ registry, standards });
  const service = new RenderService(host);

  if (args.list) {
    for (const entry of service.listTemplates()) {
      const params = entry.drivingParameters
        .map((p) => `${p.name}=${p.value}${p.unit === "count" ? "" : p.unit}`)
        .join(", ");
      process.stdout.write(`${entry.id}\t${entry.name}\t[${params}]\n`);
    }
    return 0;
  }

  if (!args.template) {
    process.stderr.write("A --template is required (or use --list).\n");
    return 2;
  }

  // A path loads and registers an external template; otherwise it is an id.
  let templateId = args.template;
  if (args.template.endsWith(".json")) {
    try {
      const doc = JSON.parse(readFileSync(args.template, "utf8")) as TemplateDefinition;
      registry.registerTemplate(doc);
      templateId = doc.id;
    } catch (error) {
      process.stderr.write(
        `Could not load template '${args.template}': ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
      return 2;
    }
  }

  try {
    const result = service.render(templateId, {
      params: args.set,
      format: args.format,
      dxfVersion: args.dxfVersion,
      sheetSize: args.sheetSize,
      scaleDenominator: args.scale,
      projectName: args.project,
      drawingTitle: args.title,
    });

    for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
    if (result.compliance) {
      if (!result.compliance.verified) {
        process.stderr.write(
          `warning: standards profile ${result.compliance.profileId} is UNVERIFIED.\n`
        );
      }
      for (const v of result.compliance.boundViolations) {
        process.stderr.write(`compliance: ${v.message}\n`);
      }
      for (const v of result.compliance.standardsViolations) {
        process.stderr.write(`compliance: ${v.message} [${v.codeRef}]\n`);
      }
    }

    if (args.out) {
      writeFileSync(args.out, result.body);
      process.stderr.write(`Wrote ${result.body.length} bytes to ${args.out}\n`);
    } else if (args.format === "pdf") {
      process.stderr.write("PDF is binary; pass --out <path>.\n");
      return 2;
    } else {
      process.stdout.write(new TextDecoder().decode(result.body));
    }
    return 0;
  } catch (error) {
    process.stderr.write(
      `Render failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  }
}

// `import.meta.main` is true only when executed directly, so importing this
// module from a test does not run the CLI.
if (import.meta.main) {
  process.exit(run(process.argv.slice(2)));
}
