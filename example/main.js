aff => {

  // Parse CLI into a single expression
  function fail(msg) {
    aff.global.console.warn(msg);
    aff.global.process.exit(1);
  }
  const cli = aff.import('./cli.js', { fail });
  const word = cli.parseArgs(aff.subArgs);

  // Pluralize the word
  const { pluralize } = aff.import('./pluralize.js', {});
  aff.global.console.log(pluralize(word));

}
