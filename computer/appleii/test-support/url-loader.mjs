// Keep browser URL imports unchanged while testing the local working tree.
export function resolve(specifier, context, next) {
  const prefix = 'https://subnetpie.github.io/computer/appleii/';
  if(specifier.startsWith(prefix))
    return next(new URL('../' + specifier.slice(prefix.length), import.meta.url).href, context);
  return next(specifier, context);
}
