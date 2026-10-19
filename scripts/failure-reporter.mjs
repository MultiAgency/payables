/** A node:test reporter that writes each failing test's file, name and error, and nothing for passes. */
export default async function* failures(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail' || event.data.details?.type === 'suite') continue;
    // The file and test name identify the test; line numbers come from the transformed source and can mislead.
    const { name, file, details } = event.data;
    const error = details?.error?.cause ?? details?.error;
    yield `✖ ${file ?? 'unknown file'} › ${name}\n${error?.stack ?? error?.message ?? String(error)}\n\n`;
  }
}
