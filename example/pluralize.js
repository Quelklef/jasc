aff => {
  function pluralize(word) {
    if (word.endsWith('y'))
      return word.slice(0, -1) + 'ies';
    else if (word.endsWith('sh') || word.endsWith('ch'))
      return word + 'es';
    else
      return word + 's';
  }

  // Just testing transitive imports
  const ok = aff.import('./blank.js');
  if (ok !== 'ok') throw 'something went wrong!';

  return { pluralize };
}
