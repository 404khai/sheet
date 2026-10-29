// No extension dependencies or remote code. Load dist/ as an unpacked extension.
const output = `${import.meta.dir}/dist`
const result = await Bun.build({
  entrypoints: [`${import.meta.dir}/content.js`],
  outdir: output, target: 'browser', format: 'iife', minify: true,
})
if (!result.success) throw new Error(result.logs.join('\n'))
for (const name of ['manifest.json', 'background.js']) {
  await Bun.write(`${output}/${name}`, Bun.file(`${import.meta.dir}/${name}`))
}
console.log(`Load unpacked extension: ${output}`)
