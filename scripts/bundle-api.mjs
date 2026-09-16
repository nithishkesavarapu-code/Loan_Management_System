import esbuild from 'esbuild';

esbuild.buildSync({
  entryPoints: ['apps/api/src/serverless.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'apps/api/api/index.js',
  external: [
    'bcrypt',
    'cookie-parser',
    'express',
    'file-type',
    'helmet',
    'jose',
    'mongoose',
    'multer',
    'zod',
  ],
});
console.log('Successfully bundled apps/api/api/index.js with @lms/shared inlined.');
