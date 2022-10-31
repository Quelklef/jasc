const fs = require('fs');
const plib = require('path');
const es = require('esprima');
const esc = require('escope');
const process = require('process');

function main() {

  let jsPath = process.argv[2];
  jsPath = plib.resolve(jsPath);
  if (!jsPath) throw Error('Please call with a single arugment pointing to a javascript file.');

  const jsText = fs.readFileSync(jsPath).toString();
  const root = es.parseScript(jsText, { loc: true });
  const scopes = esc.analyze(root);

  // console.dir(node, { depth: null });

  const violations = check(root, scopes);

  for (const vln of violations) {
    console.warn(mkWarning(jsPath, jsText, vln))
  }

  const isOk = violations.length === 0;
  process.exit(isOk);

  function mkWarning(srcPath, srcText, { loc, reason }) {
    let msg = '';
    msg += 'JASC violation'
    msg += ` in ${srcPath} at ${loc.start.line}:${loc.start.column} thru ${loc.end.line}:${loc.end.column}\n`;
    msg += `  ${reason}\n`;

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

    return msg;
  }
}


// Take an esprima AST node and produce an array of violations
function * check(root, scopes) {

  const disallowances = [

    // num++
    (node => node.type == 'UpdateExpression' && `Mutation is disallowed (${node.operator} operator)`),

    // delete obj[attr]
    (node => node.type === 'UnaryExpression' && node.operator === 'delete' && 'Mutation is disallowed (delete operator)'),

    // obj.attr = val
    // (obj = val is fine)
    (node  => node.type === 'AssignmentExpression'
           && node.left.type === 'MemberExpression'
           && `The left-hand side of an assignment may not be a property access`
    ),

  ];

  // Apply simple rules
  for (const node of traverse(root)) {
    for (const f of disallowances) {
      const err = f(node);
      if (err) yield {
        loc: node.loc,
        reason: err,
      }
    }
  }

  // Check for global references
  for (const node of traverse(root)) {
    const scope = scopes.acquire(node);
    if (!scope) continue;
    for (const ref of scope.references) {
      if (!ref.resolved) {
        yield {
          loc: ref.identifier.loc,
          reason: `Reference to undeclared variable '${ref.identifier.name}' is disallowed`,
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




main();
