/**
 * Expression Engine for Parametric 2D CAD
 * Tokenizes, parses, and evaluates mathematical formulas with variable references and functions.
 */

export type TokenType =
  | "NUMBER"
  | "IDENTIFIER"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "PERCENT"
  | "CARET"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

export type ASTNode =
  | { type: "NumberLiteral"; value: number }
  | { type: "Identifier"; name: string }
  | { type: "UnaryOp"; operator: "+" | "-"; argument: ASTNode }
  | { type: "BinaryOp"; operator: "+" | "-" | "*" | "/" | "%" | "^"; left: ASTNode; right: ASTNode }
  | { type: "FunctionCall"; name: string; args: ASTNode[] };

export interface ParseResult {
  ast: ASTNode | null;
  error?: string;
  dependencies: string[];
}

export interface EvaluationResult {
  value: number;
  error?: string;
}

export type SymbolTable = Record<string, number>;

/**
 * Tokenizer / Lexer for mathematical formulas
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (char === "+") {
      tokens.push({ type: "PLUS", value: "+", pos: i });
      i++;
      continue;
    }
    if (char === "-") {
      tokens.push({ type: "MINUS", value: "-", pos: i });
      i++;
      continue;
    }
    if (char === "*") {
      tokens.push({ type: "STAR", value: "*", pos: i });
      i++;
      continue;
    }
    if (char === "/") {
      tokens.push({ type: "SLASH", value: "/", pos: i });
      i++;
      continue;
    }
    if (char === "%") {
      tokens.push({ type: "PERCENT", value: "%", pos: i });
      i++;
      continue;
    }
    if (char === "^") {
      tokens.push({ type: "CARET", value: "^", pos: i });
      i++;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "LPAREN", value: "(", pos: i });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "RPAREN", value: ")", pos: i });
      i++;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "COMMA", value: ",", pos: i });
      i++;
      continue;
    }

    // Number literals (including decimals e.g. 10.5)
    if (/[0-9]/.test(char) || (char === "." && i + 1 < input.length && /[0-9]/.test(input[i + 1]))) {
      let numStr = "";
      const start = i;
      while (i < input.length && (/[0-9]/.test(input[i]) || input[i] === ".")) {
        numStr += input[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: numStr, pos: start });
      continue;
    }

    // Identifiers & Shape properties (e.g. W, Height, Rectangle_1.width, Line_1.x2)
    if (/[a-zA-Z_]/.test(char)) {
      let idStr = "";
      const start = i;
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i])) {
        idStr += input[i];
        i++;
      }
      tokens.push({ type: "IDENTIFIER", value: idStr, pos: start });
      continue;
    }

    throw new Error(`Unexpected character '${char}' at index ${i}`);
  }

  tokens.push({ type: "EOF", value: "", pos: i });
  return tokens;
}

/**
 * Recursive-descent AST Parser
 */
class ExpressionParser {
  private tokens: Token[];
  private current = 0;
  public dependencies = new Set<string>();

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const t of types) {
      if (this.check(t)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(`${message} at position ${this.peek().pos}`);
  }

  // Grammar precedence:
  // expression -> addition
  // addition -> multiplication (('+' | '-') multiplication)*
  // multiplication -> exponentiation (('*' | '/' | '%') exponentiation)*
  // exponentiation -> unary ('^' exponentiation)?
  // unary -> ('+' | '-') unary | primary
  // primary -> NUMBER | IDENTIFIER | FunctionCall | '(' expression ')'

  public parse(): ASTNode {
    const node = this.addition();
    if (!this.isAtEnd()) {
      throw new Error(`Unexpected token '${this.peek().value}' at position ${this.peek().pos}`);
    }
    return node;
  }

  private addition(): ASTNode {
    let expr = this.multiplication();

    while (this.match("PLUS", "MINUS")) {
      const operator = this.previous().value as "+" | "-";
      const right = this.multiplication();
      expr = { type: "BinaryOp", operator, left: expr, right };
    }

    return expr;
  }

  private multiplication(): ASTNode {
    let expr = this.exponentiation();

    while (this.match("STAR", "SLASH", "PERCENT")) {
      const operator = this.previous().value as "*" | "/" | "%";
      const right = this.exponentiation();
      expr = { type: "BinaryOp", operator, left: expr, right };
    }

    return expr;
  }

  private exponentiation(): ASTNode {
    const expr = this.unary();

    if (this.match("CARET")) {
      const operator = "^";
      const right = this.exponentiation(); // right-associative
      return { type: "BinaryOp", operator, left: expr, right };
    }

    return expr;
  }

  private unary(): ASTNode {
    if (this.match("PLUS", "MINUS")) {
      const operator = this.previous().value as "+" | "-";
      const argument = this.unary();
      return { type: "UnaryOp", operator, argument };
    }

    return this.primary();
  }

  private primary(): ASTNode {
    if (this.match("NUMBER")) {
      const val = parseFloat(this.previous().value);
      if (isNaN(val)) throw new Error(`Invalid number '${this.previous().value}'`);
      return { type: "NumberLiteral", value: val };
    }

    if (this.match("IDENTIFIER")) {
      const name = this.previous().value;

      // Check if it's a function call e.g. sqrt(x)
      if (this.match("LPAREN")) {
        const args: ASTNode[] = [];
        if (!this.check("RPAREN")) {
          do {
            args.push(this.addition());
          } while (this.match("COMMA"));
        }
        this.consume("RPAREN", "Expected ')' after function arguments");
        return { type: "FunctionCall", name: name.toLowerCase(), args };
      }

      // Check for math constants
      if (name.toLowerCase() === "pi") {
        return { type: "NumberLiteral", value: Math.PI };
      }
      if (name.toLowerCase() === "e") {
        return { type: "NumberLiteral", value: Math.E };
      }

      // Variable identifier
      this.dependencies.add(name);
      return { type: "Identifier", name };
    }

    if (this.match("LPAREN")) {
      const expr = this.addition();
      this.consume("RPAREN", "Expected ')' after expression");
      return expr;
    }

    throw new Error(`Unexpected token '${this.peek().value}' at position ${this.peek().pos}`);
  }
}

/**
 * Parses formula into AST and extracts referenced variable dependencies
 */
export function parseFormula(formula: string): ParseResult {
  let trimmed = formula.trim();
  if (!trimmed) {
    return { ast: null, error: "Formula cannot be empty", dependencies: [] };
  }

  // Handle optional assignment syntax like "InnerWidth = OuterWidth * 0.8"
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx !== -1) {
    trimmed = trimmed.slice(eqIdx + 1).trim();
    if (!trimmed) {
      return { ast: null, error: "Expression missing after '='", dependencies: [] };
    }
  }

  try {
    const tokens = tokenize(trimmed);
    const parser = new ExpressionParser(tokens);
    const ast = parser.parse();
    return {
      ast,
      dependencies: Array.from(parser.dependencies),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Formula syntax error";
    return {
      ast: null,
      error: msg,
      dependencies: [],
    };
  }
}

/**
 * Built-in CAD mathematical functions
 */
const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: (x) => {
    if (x < 0) throw new Error("sqrt() requires a non-negative number");
    return Math.sqrt(x);
  },
  sin: (deg) => Math.sin((deg * Math.PI) / 180),
  cos: (deg) => Math.cos((deg * Math.PI) / 180),
  tan: (deg) => {
    const rad = (deg * Math.PI) / 180;
    return Math.tan(rad);
  },
  asin: (x) => (Math.asin(x) * 180) / Math.PI,
  acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
  atan2: (y, x) => (Math.atan2(y, x) * 180) / Math.PI,
  abs: (x) => Math.abs(x),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  round: (x) => Math.round(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  degtorad: (deg) => (deg * Math.PI) / 180,
  radtodeg: (rad) => (rad * 180) / Math.PI,
  hypot: (x, y) => Math.hypot(x, y),
  pow: (x, y) => Math.pow(x, y),
};

/**
 * Evaluates an AST with a given symbol table
 */
export function evaluateAST(ast: ASTNode, symbols: SymbolTable): EvaluationResult {
  try {
    const val = evaluateNode(ast, symbols);
    if (!isFinite(val)) {
      return { value: 0, error: "Result is infinite or undefined" };
    }
    return { value: val };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Evaluation error";
    return { value: 0, error: msg };
  }
}

function evaluateNode(node: ASTNode, symbols: SymbolTable): number {
  switch (node.type) {
    case "NumberLiteral":
      return node.value;

    case "Identifier": {
      if (node.name in symbols) {
        return symbols[node.name];
      }
      const lower = node.name.toLowerCase();
      for (const [k, v] of Object.entries(symbols)) {
        if (k.toLowerCase() === lower) return v;
      }
      throw new Error(`Undefined variable '${node.name}'`);
    }

    case "UnaryOp": {
      const arg = evaluateNode(node.argument, symbols);
      return node.operator === "-" ? -arg : arg;
    }

    case "BinaryOp": {
      const left = evaluateNode(node.left, symbols);
      const right = evaluateNode(node.right, symbols);

      switch (node.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          if (Math.abs(right) < 1e-12) {
            throw new Error("Division by zero");
          }
          return left / right;
        case "%":
          return left % right;
        case "^":
          return Math.pow(left, right);
      }
      break;
    }

    case "FunctionCall": {
      const fn = MATH_FUNCTIONS[node.name];
      if (!fn) {
        throw new Error(`Unknown function '${node.name}()'`);
      }
      const evalArgs = node.args.map((arg) => evaluateNode(arg, symbols));
      return fn(...evalArgs);
    }
  }
}

/**
 * Evaluates a formula string directly against a symbol table
 */
export function evaluateFormula(formula: string, symbols: SymbolTable): EvaluationResult {
  const parseRes = parseFormula(formula);
  if (parseRes.error || !parseRes.ast) {
    return { value: 0, error: parseRes.error || "Parse failed" };
  }
  return evaluateAST(parseRes.ast, symbols);
}
