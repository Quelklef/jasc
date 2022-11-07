({ fail }) => {
  function parseArgs(args) {
    if (args.length !== 1)
      fail('Expected exactly one argument');
    const arg = args[0];
    return arg;
  };

  return { parseArgs };
}
