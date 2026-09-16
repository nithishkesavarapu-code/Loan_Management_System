import esbuild from 'esbuild';

esbuild.buildSync({
  entryPoints: ['apps/api/src/serverless.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'apps/api/api/index.js',
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join('\n'),
  },
  external: [
    'bcrypt',
  ],
});
console.log('Successfully bundled apps/api/api/index.js (fully self-contained except bcrypt).');

