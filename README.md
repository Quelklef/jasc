# Jasc

## What is it?

Jasc is a carefully-selected subset of Javascript designed to help you write good code by default.

In particular, Jasc code is 'opt-in' instead of 'opt-out' on language features that can have insidious effects on codebase quality, such as value mutation, IO, and mutative closures.

For instance, a Javascript module that looks like this:

```javascript
const fs = require('fs');
for (const item of fs.readdirSync('.'))
  console.log(item);
```

might be translated into a Jasc module that looks like this:

```javascript
({ fs, console }) => {
  for (const item of fs.readdirSync('.'))
    console.log(item);
}
```

The two snippets are basically equivalent. However, Jasc modules don't innately have access to `require` or `console`; instead, the Jasc module 'factors out' all if its effectful operations into a parameter, to be supplied by whomever imports the module.

This may sound like a superficial modification, but has some seriously-nice consequences when applied to an entire codebase:

- A module is only as impure as you let it be (modules are effect-monotonic)

  If you don't pass `console` to a Jasc module (or something by which `console` can be accessed), then module can't call `console.log`. In the extreme, if you pass nothing to a module, then you know it can't do anything "impure" at all

  (excepting particularly-degenerate cases; see the "More Details" section later in this document)

- As a consequence, Jasc modules self-document what kinds of effects they may be performing

- You get dependency injection for free

  If you have a module that uses `fs`, and want to test it using a mock filesystem, you *just can*: simply pass in your `fs` mock instead of `require('fs')`


## How do I use it?

1. Clone this repo

1. Write some Jasc! Here's a starter. (Or check out `example/`)

   (remark -- `aff` stands for "affordance")

   ```javascript
   // ./main.js
   aff => {
     const log = (...args) => aff.global.console.log(...args);
     const { delim } = aff.import('./lib.js', { log });
     log("Hello" + delim + "world!")
   }
   ```

   ```javascript
   // ./lib.js
   ({ log }) => {
    log("In lib.js");
    const delim = ", ";
    return { delim };
   }
   ```

1. Use Jasc to invoke your module

   ```bash
   node /path/to/jasc.js ./main.js ./*.js
   ```

   Note that Jasc requires you to pass in *both* your main module *and* any other modules that might be imported. (This is a design decision: this requirement means that project modules are self-documenting)


## More Details

### What does Jasc disallow?

The following are prohibited in a Jasc module:

- Value mutation (eg `val.k = v`)
- Global references (eg `console` in `console.log()`). This includes `require`.
- Non-`const` variables (todo!)

Please note:

- Due to the specifics of the Javascript language, it's not possible to completely *disallow* effects from within Jasc modules, only to discourage them. An adverserial actor can still write, [for instance](https://stackoverflow.com/a/48748652/4608364), `({}).constructor.constructor("console.log('oops')")()` to access `console`.

- `throw` is allowed in Jasc modules. There is no good way to disallow exceptions without introducing a type-system, which would both be a massive effort commitment and also go against the "it's just Javascript" philosophy of Jasc.
 
  (The name "Jasc" is a subsequence of the name "Javascript", reflecting the intent that Jasc be a subset of Javascript)

### What does using Jasc do for me?

Valid Jasc projects (theoretically) abide by the following:

- Modules are effect-monotonic, or pure-by-default: if you don't give a module access to `fs`, then it can't do filesystem operations

- Top-level inputs are made explicit. Unless `aff.global` is accessed, the following is a comprehensive list of program inputs:
  - The current `node` version and `jasc` version
  - The list of Jasc modules provided to `jasc`
  - The command-line arguments
  - The project root (wip!)

These properties mean that Jasc code is safe-by-default and encourage well-structured codebases.

### How do modules work?

The top-level `aff` provided to your `main` module includes an `import` key for performing imports of other Jasc modules. If module `a.js` executes `aff.import('./b.js', subAff)`, two steps will be performed:

1. `subAff` will be extended with the `import` attribute. (As well as `modules` and `thisModulePath`, but ignore those)
2. The result will be used to invoke `b.js`

### Writing `aff.global.console.log` is annoying!

Yes, it is. This is a good thing, because it encourages creation of an application-specific logging affordance and discourages passing the top-level `aff` around.
