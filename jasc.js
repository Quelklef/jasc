const fs = require('fs');
const plib = require('path');
const es = require('esprima');
const esc = require('escope');
const process = require('process');

// REMINDER
//   new {}.constructor.constructor("alert('evil!')")()
// from
//   https://stackoverflow.com/questions/48748584/esprima-detect-global-scope-access

function main() {

  // Parse CLI args
  const {
    mainLoc,  // Main module location (absolute)
    modLocs,  // All module locations (absolute)
    subArgs,  // CLI args to pass to main module
  } = parseCli(process.argv);

  // Validate all modules
  for (const loc of modLocs) {
    const warnings = validate(loc);
    if (warnings.length > 0)
      fail1(warnings.join('\n'));
  }

  // Build top-level affordance
  const aff = mkAff({ mainLoc, modLocs, subArgs });

  // Execute main module
  aff.import(mainLoc, aff);

}

function parseCli(argv) {
  const args = argv.slice(2);  // ['node', 'jasc.js', ...]
  if (args.length === 0)
    throw Error('Usage: node jasc /path/to/main.js /paths/to/{many,module,files,including,main}.js -- arg1 arg2');
  let breakIdx = args.indexOf('--');
  breakIdx = breakIdx === -1 ? args.length : breakIdx;
  const allLocs = args.slice(0, breakIdx).map(relPath => plib.resolve(process.env.PWD, relPath))
  const [mainLoc, ...modLocs] = allLocs;
  const subArgs = args.slice(breakIdx + 1);
  return { mainLoc, modLocs, subArgs };
}

function mkAff({ mainLoc, modLocs, subArgs }) {
  const aff = {};

  // Basic stuff
  aff.global = globalThis;
  aff.subArgs = subArgs;

  // Import stuff
  aff.modules = {};
  for (const loc of modLocs) {
    const jsText = fs.readFileSync(loc).toString();
    const module = requireExpr(jsText, loc);
    aff.modules[loc] = module;
  }
  aff.thisModulePath = mainLoc;
  aff.import = function(relPath, subAff = {}) {
    const modLoc = plib.resolve(plib.dirname(this.thisModulePath), relPath);

    subAff = { ...subAff };
    subAff.modules = this.modules;
    subAff.import = this.import;
    subAff.thisModulePath = modLoc;

    const module = this.modules[modLoc];

    if (!(typeof module === 'function')) {
      let err = `[jasc] Unable to import ${modLoc} (from ${this.thisModulePath}): `;
      if (module) {
        err += 'module exists but did not evaluate to a function';
      } else {
        err += 'no such module.';
        if (fs.existsSync(modLoc)) {
          err += ` However, a file does exist at ${modLoc}. Perhaps you forgot to provide it as an argument to jasc?`;
          if (modLoc === mainLoc)
            err += ` Note that the main module must be specified both as "main" and as "module".`
        }
      }
      fail1(err);
    }

    return module(subAff);
  };

  return aff;
}


// require() a javascript expression
// https://stackoverflow.com/a/17585470/4608364
function requireExpr(jsExpr, filename) {
  const Module = module.constructor;
  const mod = new Module();
  mod._compile('exports.default = (\n' + jsExpr + '\n);', filename);
  return mod.exports.default;
}


// Takes a path to a JS file and produces an array of JASC violations (ie, string warnings)
function validate(jsPath) {
  const jsText = fs.readFileSync(jsPath).toString();
  const root = es.parseScript(jsText, { loc: true });

  // console.dir(root, { depth: null });

  const violations = Array.from(check(root));
  return violations.map(vln => mkWarning(jsPath, jsText, vln));
}


function mkWarning(srcPath, srcText, { loc, reason }) {
  let msg = '';
  msg += 'JASC violation'
  msg += ` in ${srcPath} at ${loc.start.line}:${loc.start.column} thru ${loc.end.line}:${loc.end.column}\n`;

  const srcLines = srcText.split('\n');
  for (let lineno = loc.start.line - 2; lineno <= loc.end.line + 2; lineno++) {
    const lineIdx = lineno - 1;  // blame esprima
    const line = srcLines[lineIdx];
    if (!line) continue;

    const isErrLine = lineno >= loc.start.line && lineno <= loc.end.line;
    const prefix = isErrLine ? '>' : ' ';

    const lastLineno = loc.end.line + 2 + '';
    const linenoPretty = (lineno + '').padStart(lastLineno.length);

    msg += `  ${prefix} ${linenoPretty} | ` + line + '\n';
  }

  msg += `  ${reason}\n`;
  return msg;
}


// Take an esprima AST node and produce an array of violations
function * check(root) {
  const simpleRules = [
    // delete obj[attr]
    (node => node.type === 'UnaryExpression'
          && node.operator === 'delete'
          && 'The delete operator is forbidden (to prevent object mutation)'
    ),
    // obj.attr = val
    (node => node.type === 'AssignmentExpression'
          && node.left.type === 'MemberExpression'
          && `The left-hand side of an assignment may not be a property access (to prevent object mutation)`
    ),
  ];

  // Apply simple rules
  for (const node of traverse(root)) {
    for (const f of simpleRules) {
      const err = f(node);
      if (err) yield {
        loc: node.loc,
        reason: err,
      }
    }
  }

  // Check for global references
  const scopes = esc.analyze(root, { ignoreEval: true }).scopes;
  for (const scope of scopes) {
    for (const ref of scope.references) {
      if (!ref.resolved) {
        yield {
          loc: ref.identifier.loc,
          reason: `Reference to undeclared variable '${ref.identifier.name}' is forbidden (to disallow access to global objects like 'console' and 'document')`,
        };
      }
    }
  }
}

// Yield an esprima node and all its descendants
function * traverse(node) {
  if (node === null || typeof node !== 'object') return;
  if (Object.keys(node).includes('type')) yield node;
  for (const v of Object.values(node)) {
    yield * traverse(v);
  }
}

function fail1(message) {
  console.warn(message);
  process.exit(1);
}

main();
